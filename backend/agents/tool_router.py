"""
NEXUS Tool Router — dict-dispatch execution engine for Gemini function calls.

Replaces the long if/elif chain that previously lived in NexusAgent.execute_tool.
Each tool is registered as a handler function in TOOL_HANDLERS, making it trivial
to add new tools without touching existing code (Open/Closed Principle).

The ToolRouter class holds references to the tool engine instances (Creative,
Navigator, Code) and the Gemini client, so each handler has access to
everything it needs via closure over `self`.
"""

import base64
import logging
from typing import Any

from google import genai
from google.genai import types

from backend.agents.base_agent import AgentSession, MODEL_FLASH
from backend.agents.system_prompts import ALL_SYSTEM_INSTRUCTIONS, LIVE_SYSTEM_INSTRUCTION
from backend.tools.creative_engine import CreativeEngine
from backend.tools.navigator_engine import NavigatorEngine
from backend.tools.code_engine import CodeEngine

logger = logging.getLogger("nexus.agent.tools")


class ToolRouter:
    """
    Dispatches Gemini function calls to the correct tool engine.

    Uses a dict-based command pattern instead of if/elif chains.
    Each handler is an async method that takes (session_id, args)
    and returns a dict result.
    """

    def __init__(self, client: genai.Client) -> None:
        self._client = client
        self.creative_engine = CreativeEngine(client=client)
        self.navigator_engine = NavigatorEngine()
        self.code_engine = CodeEngine()

        # Handler registry — maps tool name → async handler method.
        # To add a new tool, just add a new entry here and implement the method.
        self._handlers: dict[str, Any] = {
            # Common tools
            "search_web": self._handle_search_web,
            "remember_fact": self._handle_remember_fact,
            "change_ui_theme": self._handle_change_ui_theme,
            "render_widget": self._handle_render_widget,
            "propose_story_choices": self._handle_propose_story_choices,
            "consult_agent": self._handle_consult_agent,
            # Creative tools
            "generate_image": self._handle_generate_image,
            "generate_story": self._handle_generate_story,
            # Navigator tools (Playwright)
            "navigate": self._handle_navigate,
            "capture_screenshot": self._handle_capture_screenshot,
            "click_element": self._handle_click_element,
            "type_text": self._handle_type_text,
            "scroll_page": self._handle_scroll_page,
            # Code Copilot tools
            "read_directory": self._handle_read_directory,
            "read_file": self._handle_read_file,
            "execute_code": self._handle_execute_code,
        }

    async def execute(
        self,
        session_id: str,
        tool_name: str,
        args: dict[str, Any],
        sessions: dict[str, AgentSession],
    ) -> dict[str, Any]:
        """
        Route a tool call to the appropriate handler.

        session_id is injected by the SessionManager so navigator tools
        know which browser context to operate on. Non-navigator tools
        just ignore it.
        """
        logger.info(f"Executing tool: {tool_name} with args: {args}")

        handler = self._handlers.get(tool_name)
        if handler:
            return await handler(session_id, args, sessions)

        logger.warning(f"No handler registered for tool: {tool_name}")
        return {"error": f"Unknown tool: {tool_name}"}

    # ── Common Tool Handlers ──────────────────────────────────────────

    async def _handle_search_web(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Execute a web search via Google Search grounding."""
        query = args.get("query", "")
        try:
            response = self._client.models.generate_content(
                model=MODEL_FLASH,
                contents=query,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.3,
                ),
            )
            if response.candidates and response.candidates[0].content:
                text = response.candidates[0].content.parts[0].text
                return {"status": "success", "result": text}
            return {"status": "no_results", "result": "No search results found."}
        except Exception as e:
            logger.error(f"Search error: {e}")
            return {"status": "error", "result": str(e)}

    async def _handle_remember_fact(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Save a factual observation to the session's persistent memory."""
        fact = args.get("fact", "")
        logger.info(f"Remembering physical world fact: {fact}")
        session = sessions.get(session_id)
        if session:
            session.memory.append(fact)
            # Keep memory bounded to last 20 facts to avoid context bloat
            if len(session.memory) > 20:
                session.memory.pop(0)
            return {"status": "success", "fact_saved": fact}
        return {"status": "error", "message": "Session not found for memory storage"}

    async def _handle_change_ui_theme(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Frontend handles the visual change — we just ack success."""
        return {"status": "success", "theme_applied": args.get("theme", "dark")}

    async def _handle_render_widget(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Frontend intercepts tool_call to render the UI widget. We ack success."""
        return {"status": "success", "widget_rendered": args.get("widget_type")}

    async def _handle_propose_story_choices(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Frontend intercepts this to render interactive choice buttons."""
        return {"status": "success", "choices_proposed": [args.get("choice_a"), args.get("choice_b")]}

    async def _handle_consult_agent(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """SWARM CAPABILITY: pause the Live interaction, ask another persona, return the answer."""
        specialty = str(args.get("specialty", "live"))
        query = str(args.get("query", ""))
        logger.info(f"Consulting sub-agent [{specialty}] concerning: {query}")
        try:
            sub_instruction = ALL_SYSTEM_INSTRUCTIONS.get(specialty, LIVE_SYSTEM_INSTRUCTION)
            response = self._client.models.generate_content(
                model=MODEL_FLASH,
                contents=query,
                config=types.GenerateContentConfig(
                    system_instruction=sub_instruction,
                    temperature=0.4,
                ),
            )
            if response.candidates and response.candidates[0].content:
                text = response.candidates[0].content.parts[0].text
                return {
                    "status": "success", 
                    "consultation_result": text,
                    "specialty": specialty
                }
            return {"status": "error", "message": "Sub-agent returned no result."}
        except Exception as e:
            logger.error(f"Consultation error: {e}")
            return {"status": "error", "message": str(e)}

    # ── Creative Tool Handlers ────────────────────────────────────────

    async def _handle_generate_image(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Generate an image using Gemini's native image generation."""
        prompt = args.get("prompt", "")
        style = args.get("style", "photorealistic")
        try:
            response = self._client.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=f"Generate an image: {prompt}. Style: {style}",
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                ),
            )
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        img_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                        return {
                            "status": "success",
                            "image_data": img_b64,
                            "mime_type": part.inline_data.mime_type,
                        }
            return {"status": "no_image", "result": "Image generation returned no image."}
        except Exception as e:
            logger.error(f"Image generation error: {e}")
            return {"status": "error", "result": str(e)}

    async def _handle_generate_story(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        """Generate a multi-scene story with interleaved text and images."""
        results: list[dict[str, Any]] = []
        async for chunk in self.creative_engine.generate_story(
            prompt=args.get("prompt", ""),
            style=args.get("style", "vivid and cinematic"),
            num_scenes=int(args.get("num_scenes", 3)),
        ):
            results.append(chunk)
        return {"status": "success", "content": results}

    # ── Navigator Tool Handlers (Playwright) ──────────────────────────

    async def _handle_navigate(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.navigator_engine.navigate(
            session_id=session_id,
            url=args.get("url", ""),
        )

    async def _handle_capture_screenshot(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.navigator_engine.capture_screenshot(session_id)

    async def _handle_click_element(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.navigator_engine.click_element(
            session_id=session_id,
            selector=args.get("selector", ""),
            x=int(args.get("x", 0)),
            y=int(args.get("y", 0)),
            description=args.get("description", ""),
        )

    async def _handle_type_text(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.navigator_engine.type_text(
            session_id=session_id,
            selector=args.get("selector", ""),
            text=args.get("text", ""),
        )

    async def _handle_scroll_page(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.navigator_engine.scroll(
            session_id=session_id,
            direction=args.get("direction", "down"),
            amount=int(args.get("amount", 400)),
        )

    # ── Code Copilot Tool Handlers ────────────────────────────────────

    async def _handle_read_directory(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.code_engine.read_directory(
            path=args.get("path", "."),
        )

    async def _handle_read_file(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.code_engine.read_file(
            file_path=args.get("file_path", ""),
        )

    async def _handle_execute_code(
        self, session_id: str, args: dict[str, Any], sessions: dict[str, AgentSession]
    ) -> dict[str, Any]:
        return await self.code_engine.execute_code(
            code=args.get("code", ""),
            language=args.get("language", "python"),
        )
