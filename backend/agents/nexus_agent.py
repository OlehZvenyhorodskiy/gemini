"""
NEXUS Agent — the main multi-agent orchestrator.

This is the slim orchestrator that wires together the modular components:
- system_prompts.py  → persona instructions for each mode
- base_agent.py      → AgentSession, constants, tool declarations
- tool_router.py     → dict-dispatch execution engine for function calls

NexusAgent handles the high-level flow: session lifecycle, message
processing (text/audio/video), mode switching, and config updates.
All the heavy lifting is delegated to the specialized modules.
"""

import base64
import logging
from typing import Any

from google import genai
from google.genai import types

from backend.agents.base_agent import (
    GOOGLE_API_KEY,
    MODE_TO_BASE,
    AgentSession,
    get_model_for_mode,
    get_tools_for_mode,
)
from backend.agents.system_prompts import (
    ALL_SYSTEM_INSTRUCTIONS,
    LIVE_SYSTEM_INSTRUCTION,
)
from backend.agents.tool_router import ToolRouter

logger = logging.getLogger("nexus.agent")


class NexusAgent:
    """
    The main agent controller that wraps the Gemini GenAI client
    and manages multi-modal interactions across all modes.

    Compared to the pre-refactor version, this class is a thin
    orchestrator — system prompts, tool declarations, and tool
    execution logic now live in their own modules.
    """

    def __init__(self) -> None:
        self._client = genai.Client(api_key=GOOGLE_API_KEY)
        self._sessions: dict[str, AgentSession] = {}
        self._tool_router = ToolRouter(client=self._client)

        logger.info("NexusAgent initialized with Gemini client + modular tool engines")

    # ── System Instruction Assembly ───────────────────────────────────

    def _get_system_instruction(self, session_id: str, mode: str) -> str:
        """Return the system prompt for the current mode, with injected context."""
        base_prompt = ALL_SYSTEM_INSTRUCTIONS.get(mode, LIVE_SYSTEM_INSTRUCTION)
        session = self._sessions.get(session_id)

        if session:
            # Inject Persona Override from user config
            if "persona" in session.config:
                persona = session.config["persona"]
                if persona != "default":
                    base_prompt += f"\n\n## PERSONA OVERRIDE: {persona.upper()}\nAdopt a highly {persona} tone and strictly adhere to this character trait in all your responses. Change your vocabulary and demeanor entirely to match this persona."

            # Inject Physical World Memory Context
            if session.memory:
                memories_str = "\n- ".join(session.memory)
                base_prompt += f"\n\n## PHYSICAL WORLD MEMORY\nYou have observed and remembered the following facts about the user's environment or situation:\n- {memories_str}\nUse these facts seamlessly in conversation to demonstrate continuous awareness."

        return base_prompt

    # Per-mode temperature — lower values = more factual & precise,
    # higher values = more creative & varied. Tuned to minimize
    # hallucination in precision modes while keeping creative modes fun.
    MODE_TEMPERATURE: dict[str, float] = {
        "navigator": 0.2,   # Precision — wrong click = disaster
        "security": 0.2,    # Precision — false positives are costly
        "code": 0.3,        # Mostly precise, slight creativity for suggestions
        "research": 0.4,    # Balanced — needs to synthesize but stay factual
        "data": 0.4,        # Statistical precision
        "meeting": 0.4,     # Accurate transcription
        "fitness": 0.5,     # Balanced — precise form cues but warm coaching
        "live": 0.6,        # Conversational warmth
        "language": 0.6,    # Natural language variation
        "travel": 0.6,      # Conversational but fact-grounded
        "debate": 0.7,      # Varied argumentation styles
        "creative": 0.9,    # Maximum creativity
        "music": 0.9,       # Creative expression
        "game": 0.9,        # Dramatic storytelling
    }

    # ── Live API Configuration ────────────────────────────────────────

    def get_live_config(self, session_id: str, mode: str) -> dict:
        """
        Build the config dict for a Gemini Live API session.
        This goes straight into client.aio.live.connect(config=...).
        """
        config: dict = {
            "response_modalities": ["AUDIO"],
            "system_instruction": self._get_system_instruction(session_id, mode),
            "temperature": self.MODE_TEMPERATURE.get(mode, 0.6),
        }

        # Creative mode also generates text alongside audio
        if mode == "creative":
            config["response_modalities"] = ["AUDIO", "TEXT"]

        # Build tool declarations for the live session
        live_tools = self.get_live_tools(mode)
        if live_tools:
            config["tools"] = live_tools

        return config

    def get_live_tools(self, mode: str) -> list:
        """Get the tool declarations formatted for Live API config."""
        return get_tools_for_mode(mode)

    # ── Session Lifecycle ─────────────────────────────────────────────

    async def initialize_session(self, session_id: str) -> None:
        """Initialize a new agent session with default config."""
        self._sessions[session_id] = AgentSession(session_id)
        # Spin up an isolated browser context for Navigator mode
        await self._tool_router.navigator_engine.start_session(session_id)
        logger.info(f"Agent session initialized: {session_id}")

    async def close_session(self, session_id: str) -> None:
        """Clean up an agent session when the client disconnects."""
        if session_id in self._sessions:
            self._sessions[session_id].is_active = False
            # Tear down the browser context so we don't leak resources
            await self._tool_router.navigator_engine.close_session(session_id)
            del self._sessions[session_id]
            logger.info(f"Agent session closed: {session_id}")

    # ── Mode & Config Management ──────────────────────────────────────

    async def switch_mode(self, session_id: str, new_mode: str) -> None:
        """Switch the active mode for a session."""
        session = self._sessions.get(session_id)
        if session:
            session.mode = new_mode
            logger.info(f"Session {session_id} mode → {new_mode}")

    async def interrupt(self, session_id: str) -> None:
        """Handle barge-in: user started talking while agent was responding."""
        session = self._sessions.get(session_id)
        if session:
            logger.info(f"Session {session_id} interrupted!")

    async def update_config(
        self, session_id: str, settings: dict[str, Any]
    ) -> None:
        """Update session configuration from the client."""
        session = self._sessions.get(session_id)
        if session:
            session.config.update(settings)
            logger.info(f"Session {session_id} config updated: {settings}")

    # ── Message Processing ────────────────────────────────────────────

    async def process_text(
        self,
        session_id: str,
        text: str,
        mode: str,
    ) -> list[dict[str, Any]]:
        """
        Process a text message from the user.
        Returns a list of response messages to send back.
        """
        session = self._sessions.get(session_id)
        if not session:
            return [{"type": "error", "message": "Session not found"}]

        model = get_model_for_mode(mode)
        system_instruction = self._get_system_instruction(session_id, mode)
        tools = get_tools_for_mode(mode)

        # Add user message to history
        session.history.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=text)],
            )
        )

        try:
            response = self._client.models.generate_content(
                model=model,
                contents=session.history,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=tools,
                    temperature=self.MODE_TEMPERATURE.get(mode, 0.6),
                    max_output_tokens=4096,
                ),
            )

            responses: list[dict[str, Any]] = []

            if response.candidates and response.candidates[0].content:
                content = response.candidates[0].content

                # Store assistant response in history
                session.history.append(content)

                for part in content.parts:
                    if part.text:
                        responses.append({
                            "type": "text",
                            "content": part.text,
                        })
                    elif part.function_call:
                        # Delegate tool execution to the ToolRouter
                        tool_result = await self._tool_router.execute(
                            session_id,
                            part.function_call.name,
                            dict(part.function_call.args) if part.function_call.args else {},
                            self._sessions,
                        )
                        responses.append({
                            "type": "tool_call",
                            "name": part.function_call.name,
                            "args": dict(part.function_call.args) if part.function_call.args else {},
                        })
                        responses.append({
                            "type": "tool_result",
                            "name": part.function_call.name,
                            "result": tool_result,
                        })
                    elif hasattr(part, "inline_data") and part.inline_data:
                        # Handle inline images from Gemini
                        img_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                        responses.append({
                            "type": "image",
                            "data": img_b64,
                            "mime": part.inline_data.mime_type,
                        })

            if not responses:
                responses.append({
                    "type": "text",
                    "content": "I'm not sure how to respond to that. Could you rephrase?",
                })

            return responses

        except Exception as e:
            logger.error(f"Gemini API error: {e}", exc_info=True)
            return [{"type": "error", "message": f"AI processing error: {str(e)}"}]

    async def process_audio(
        self,
        session_id: str,
        audio_data: bytes,
        mode: str,
    ) -> list[dict[str, Any]]:
        """
        DEPRECATED — audio now flows through LiveConnection.

        LiveConnection.send_audio() handles real-time streaming directly
        to the Gemini Live API. This method is kept as a fallback for
        non-live modes or when the live session isn't available.
        """
        session = self._sessions.get(session_id)
        if not session:
            return [{"type": "error", "message": "Session not found"}]

        return [{"type": "status", "state": "listening"}]

    async def process_video(
        self,
        session_id: str,
        frame_data: bytes,
        mode: str,
    ) -> list[dict[str, Any]]:
        """
        Process a video frame (JPEG) for visual context.
        The frame is sent to Gemini for real-time scene understanding.
        """
        session = self._sessions.get(session_id)
        if not session:
            return [{"type": "error", "message": "Session not found"}]

        model = get_model_for_mode(mode)
        system_instruction = self._get_system_instruction(session_id, mode)

        image_part = types.Part.from_bytes(
            data=frame_data,
            mime_type="image/jpeg",
        )

        prompt_text = {
            "live": "Describe briefly what you see. If there's something notable, mention it naturally.",
            "navigator": "Analyze this screenshot. Identify all interactive UI elements (buttons, links, input fields, menus) with their approximate positions.",
            "creative": "Describe this image in vivid detail for creative inspiration.",
        }

        user_content = types.Content(
            role="user",
            parts=[
                image_part,
                types.Part.from_text(text=prompt_text.get(mode, "")),
            ],
        )

        try:
            response = self._client.models.generate_content(
                model=model,
                contents=[user_content],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.5,
                    max_output_tokens=1024,
                ),
            )

            responses: list[dict[str, Any]] = []
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if part.text:
                        responses.append({
                            "type": "text",
                            "content": part.text,
                        })

            return responses

        except Exception as e:
            logger.error(f"Video processing error: {e}", exc_info=True)
            return [{"type": "error", "message": f"Vision error: {str(e)}"}]

    async def execute_tool(
        self, session_id: str, tool_name: str, args: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Public interface for tool execution — delegates to ToolRouter.

        Kept as a method on NexusAgent for backward compatibility with
        SessionManager and LiveConnection which call agent.execute_tool().
        """
        return await self._tool_router.execute(
            session_id, tool_name, args, self._sessions
        )
