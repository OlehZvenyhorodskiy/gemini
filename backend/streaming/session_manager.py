"""
Session Manager — orchestrates client sessions, live connections, and agent routing.

Each WebSocket client gets a ClientSession that bundles together:
- The browser WebSocket reference for sending responses
- The current agent mode (live / creative / navigator)
- A LiveConnection for real-time audio/video streaming with Gemini
- Audio/video processing utilities

This module is the central nervous system — it receives messages from
the WebSocket endpoint in main.py, routes them to the right handler
(live stream vs text completion), and relays responses back.
"""

import asyncio
import base64
import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import WebSocket

from backend.agents.nexus_agent import NexusAgent
from backend.streaming.live_connection import LiveConnection
from backend.streaming.video_handler import VideoProcessor
from backend.streaming.models import ClientAudioMessage, ClientVideoMessage, ClientTextMessage
from backend.tools.firestore_client import FirestoreClient

logger = logging.getLogger("nexus.session")

# Grab the API key for live connections
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")


@dataclass
class ClientSession:
    """
    Represents one connected user's state.
    We track everything needed to manage the conversation lifecycle,
    including the live connection for real-time streaming.
    """
    session_id: str
    websocket: WebSocket
    user_id: str = "anonymous"
    mode: str = "live"  # live | creative | navigator
    is_speaking: bool = False
    is_interrupted: bool = False
    audio_buffer: list[bytes] = field(default_factory=list)
    config: dict[str, Any] = field(default_factory=dict)
    live_connection: Optional[LiveConnection] = field(default=None)
    video_processor: Optional[VideoProcessor] = field(default=None)
    relay_task: Optional[asyncio.Task] = field(default=None)
    ws_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send_message(self, message: dict) -> None:
        async with self.ws_lock:
            await self.websocket.send_json(message)

    ws_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send_json(self, message: dict) -> None:
        async with self.ws_lock:
            await self.websocket.send_json(message)



# How long to keep a disconnected session alive before destroying it.
# Allows the client to reconnect after a brief network blip.
GRACE_PERIOD_SECONDS = 15

# After this many video frames we inject a context-management hint
# into the live connection, telling Gemini to deprioritize old frames.
CONTEXT_WINDOW_FRAME_LIMIT = 120

# High-FPS modes (navigator, security) burn through frames fast, so
# they get a higher context window before the pruning hint kicks in.
CONTEXT_WINDOW_FRAME_LIMIT_HIGH_FPS = 300


class SessionManager:
    """
    Manages all active client sessions and coordinates
    between the WebSocket layer, the ADK agent, and Gemini Live API.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, ClientSession] = {}
        self._agent = NexusAgent()
        self._firestore = FirestoreClient()

        # Graceful reconnect — maps session_id to a pending cleanup task.
        # If the client reconnects before the task fires, we cancel it
        # and swap in the new WebSocket instead of creating a new session.
        self._grace_tasks: dict[str, asyncio.Task] = {}

        # Context sliding window — counts video frames per session so we
        # can hint Gemini to release old visual context before it blows
        # through the token limit on long screen-share sessions.
        self._frame_counters: dict[str, int] = {}

        logger.info("SessionManager initialized")

    @property
    def firestore(self) -> FirestoreClient:
        """Expose Firestore for API endpoints."""
        return self._firestore

    async def create_session(self, websocket: WebSocket, user_id: str = "anonymous") -> str:
        """
        Spin up a new session for a freshly connected client.
        This creates the agent session AND sets up a live connection
        to Gemini for real-time audio streaming.
        """
        session_id = str(uuid.uuid4())[:8]
        session = ClientSession(
            session_id=session_id,
            user_id=user_id,
            websocket=websocket,
            video_processor=VideoProcessor(mode="live"),
        )
        self._sessions[session_id] = session

        # Let the ADK agent know about the new session
        await self._agent.initialize_session(session_id)

        # Save session metadata to Firestore
        await self._firestore.save_session_meta(session_id, session.mode)

        # Create and connect the live session for real-time streaming
        await self._setup_live_connection(session)

        logger.info(f"Session created: {session_id}")
        return session_id

    async def _setup_live_connection(self, session: ClientSession) -> None:
        """
        Create a LiveConnection for this session and start
        the background relay task that pipes Gemini responses
        into the browser WebSocket.
        """
        if not GOOGLE_API_KEY:
            logger.warning("No GOOGLE_API_KEY set — live connection disabled")
            await session.send_json({
                "type": "error",
                "message": "API key not configured. Live streaming disabled.",
            })
            return

        try:
            # Get the live config for the current mode
            live_config = self._agent.get_live_config(session.session_id, session.mode)
            system_instruction = live_config.get("system_instruction", "")
            
            # Fetch and inject long-term user memory if available
            if session.user_id != "anonymous":
                user_profile = await self._firestore.get_user_profile(session.user_id)
                if user_profile:
                    system_instruction += f"\n\nIMPORTANT USER FACTS (Long-Term Memory):\n{user_profile}"
                    logger.info(f"Injected user memory into system instruction for {session.user_id}")

            async def _tool_executor(name: str, args: dict[str, Any]) -> dict[str, Any]:
                if name == "remember_fact":
                    fact = args.get("fact", "")
                    success = await self._firestore.save_user_fact(session.user_id, fact)
                    if success:
                        return {"status": "saved", "message": f"Successfully remembered: {fact}"}
                    return {"error": "Failed to save fact to long-term memory."}
                
                # Fall back to agent tools
                return await self._agent.execute_tool(session.session_id, name, args)

            live_conn = LiveConnection(
                api_key=GOOGLE_API_KEY,
                system_instruction=system_instruction,
                tools=live_config.get("tools"),
                response_modalities=live_config.get("response_modalities", ["AUDIO"]),
                tool_executor=_tool_executor,
                voice_name=live_config.get("voice_name", "Aoede"),
            )

            await live_conn.connect()
            session.live_connection = live_conn

            # Start the relay task — continuously drains the live connection's
            # output queue and sends messages to the browser
            session.relay_task = asyncio.create_task(
                self._relay_responses(session),
                name=f"relay-{session.session_id}",
            )

            logger.info(f"Live connection established for session {session.session_id}")

        except Exception as e:
            logger.error(
                f"Failed to setup live connection for {session.session_id}: {e}",
                exc_info=True,
            )
            await session.send_json({
                "type": "error",
                "message": f"Live connection setup failed: {str(e)}. Text mode still works.",
            })

    async def _relay_responses(self, session: ClientSession) -> None:
        """
        Background task that reads from the LiveConnection's output queue
        and pushes each message into the browser WebSocket.

        Runs for the entire lifetime of the session. Handles errors
        gracefully so a single bad message doesn't kill the relay.
        """
        live_conn = session.live_connection
        if not live_conn:
            return

        logger.info(f"Response relay started for session {session.session_id}")

        try:
            while True:
                # Block until there's something to send
                message = await live_conn.output_queue.get()

                try:
                    await session.send_json(message)

                    # Persist to Firestore (skip audio chunks — too much data)
                    if message.get("type") != "audio":
                        await self._firestore.save_message(
                            session.session_id, message
                        )
                except Exception as ws_err:
                    logger.error(
                        f"WebSocket send error in relay ({session.session_id}): {ws_err}"
                    )
                    # If the WebSocket is dead, no point continuing
                    break

        except asyncio.CancelledError:
            logger.info(f"Response relay cancelled for session {session.session_id}")
        except Exception as e:
            logger.error(f"Response relay crashed for {session.session_id}: {e}")

    async def close_session(self, session_id: str) -> None:
        """
        Graceful disconnect — instead of nuking the session immediately,
        start a grace-period timer. If the client reconnects within
        GRACE_PERIOD_SECONDS we reuse the same session (see reconnect_session).
        """
        if session_id not in self._sessions:
            return

        # If there is already a pending grace task, skip (avoid duplicates)
        if session_id in self._grace_tasks:
            return

        async def _delayed_cleanup() -> None:
            """Runs after the grace period expires — truly destroys the session."""
            await asyncio.sleep(GRACE_PERIOD_SECONDS)

            session = self._sessions.pop(session_id, None)
            self._grace_tasks.pop(session_id, None)
            self._frame_counters.pop(session_id, None)

            if session is None:
                return

            # Cancel the relay task
            if session.relay_task and not session.relay_task.done():
                session.relay_task.cancel()
                try:
                    await session.relay_task
                except asyncio.CancelledError:
                    pass

            # Disconnect the live connection
            if session.live_connection:
                await session.live_connection.disconnect()

            # Clean up the agent session
            await self._agent.close_session(session_id)
            logger.info(f"Session {session_id} destroyed after grace period")

        self._grace_tasks[session_id] = asyncio.create_task(
            _delayed_cleanup(), name=f"grace-{session_id}"
        )
        logger.info(
            f"Session {session_id} entered {GRACE_PERIOD_SECONDS}s grace period"
        )

    async def reconnect_session(
        self, session_id: str, websocket: WebSocket
    ) -> str | None:
        """
        Attempt to reattach a new WebSocket to an existing session that
        is still in its grace period. Returns the session_id on success,
        or None if no such session exists.
        """
        if session_id not in self._sessions:
            return None

        # Cancel the pending cleanup since the client is back
        grace_task = self._grace_tasks.pop(session_id, None)
        if grace_task and not grace_task.done():
            grace_task.cancel()
            try:
                await grace_task
            except asyncio.CancelledError:
                pass

        session = self._sessions[session_id]
        session.websocket = websocket

        # Restart the relay task with the new WebSocket
        if session.relay_task and not session.relay_task.done():
            session.relay_task.cancel()
            try:
                await session.relay_task
            except asyncio.CancelledError:
                pass

        if session.live_connection:
            session.relay_task = asyncio.create_task(
                self._relay_responses(session),
                name=f"relay-{session_id}",
            )

        logger.info(f"Session {session_id} reconnected (grace period cancelled)")
        return session_id

    async def cleanup(self) -> None:
        """Shut down all sessions — called during server shutdown."""
        # Cancel any pending grace tasks first
        for task in self._grace_tasks.values():
            task.cancel()
        self._grace_tasks.clear()

        # Force-close every remaining session (skip grace period)
        for sid, session in list(self._sessions.items()):
            if session.relay_task and not session.relay_task.done():
                session.relay_task.cancel()
            if session.live_connection:
                await session.live_connection.disconnect()
            await self._agent.close_session(sid)
        self._sessions.clear()
        self._frame_counters.clear()
        logger.info("All sessions cleaned up")

    def _get_session(self, session_id: str) -> ClientSession:
        """Grab a session by ID or blow up with a clear error."""
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"No session found with id: {session_id}")
        return session

    @staticmethod
    def _get_context_limit(mode: str) -> int:
        """
        Return the context-window frame limit for a given mode.
        High-FPS modes (navigator, security) burn through frames fast,
        so they get a 300-frame window before the pruning hint fires.
        """
        if mode in ("navigator", "security"):
            return CONTEXT_WINDOW_FRAME_LIMIT_HIGH_FPS
        return CONTEXT_WINDOW_FRAME_LIMIT

    async def handle_audio(self, session_id: str, message: ClientAudioMessage) -> None:
        """
        Process incoming audio chunks from the client's microphone.
        Audio comes in as base64-encoded PCM (16kHz, 16-bit, mono).

        In Phase 2, we stream this directly to the Gemini Live API
        through the LiveConnection. No more buffering and batch processing.
        """
        session = self._get_session(session_id)

        # Decode the base64 audio data
        audio_b64 = message.data
        if not audio_b64:
            return

        audio_bytes = base64.b64decode(audio_b64)

        # If we have a live connection, stream directly to Gemini
        if session.live_connection and session.live_connection.is_connected:
            await session.live_connection.send_audio(audio_bytes)
        else:
            # Fallback to the old process_audio path
            responses = await self._agent.process_audio(
                session_id=session_id,
                audio_data=audio_bytes,
                mode=session.mode,
            )
            for response in responses:
                await session.send_json(response)

    async def handle_video(self, session_id: str, message: ClientVideoMessage) -> None:
        """
        Process incoming video frames from the client's camera or screen share.
        Frames arrive as base64-encoded JPEG (max 768x768, 1 FPS).

        In Phase 2, we process the frame through the VideoProcessor
        (resize/throttle) and then forward to the Live API.

        Context Sliding Window: Every CONTEXT_WINDOW_FRAME_LIMIT frames
        we inject a hint telling Gemini to deprioritize old visual data,
        preventing the session from blowing through the token limit.
        """
        session = self._get_session(session_id)

        frame_b64 = message.data
        if not frame_b64:
            return

        frame_bytes = base64.b64decode(frame_b64)

        # Process through the video handler — resize, rate-limit
        if session.video_processor:
            processed = session.video_processor.process_frame(frame_bytes)
            if processed is None:
                return  # Rate-limited, skip this frame
            frame_bytes = processed

        # --- Context Sliding Window ---
        count = self._frame_counters.get(session_id, 0) + 1
        self._frame_counters[session_id] = count

        if (
            count % self._get_context_limit(session.mode) == 0
            and session.live_connection
            and session.live_connection.is_connected
        ):
            logger.info(
                f"Context window maintenance for session {session_id} "
                f"(frame #{count})"
            )
            await session.live_connection.send_text(
                "[SYSTEM: Context window maintenance — you have received "
                f"{count} video frames so far. Deprioritize older visual "
                "context to stay within token limits. Focus on the most "
                "recent frames and the current conversation.]"
            )

        # If we have a live connection, stream to Gemini
        if session.live_connection and session.live_connection.is_connected:
            await session.live_connection.send_video(frame_bytes)
        else:
            # Fallback to the single-shot vision analysis
            responses = await self._agent.process_video(
                session_id=session_id,
                frame_data=frame_bytes,
                mode=session.mode,
            )
            for response in responses:
                await session.send_json(response)

    async def handle_text(self, session_id: str, message: ClientTextMessage) -> None:
        """
        Process text input — works in all modes.
        If we have a live connection, we pipe it through there
        so the agent has the conversation context. Otherwise
        we fall back to the standard generate_content path.
        """
        session = self._get_session(session_id)

        content = message.content.strip()
        if not content:
            return

        # Signal "thinking" to the UI
        await session.send_json({
            "type": "status",
            "state": "thinking",
        })

        # If live connection is active, send text through it
        # so the model has full conversation context
        if session.live_connection and session.live_connection.is_connected:
            await session.live_connection.send_text(content)
            # Response comes back through the relay task
        else:
            # Fallback to standard text processing
            responses = await self._agent.process_text(
                session_id=session_id,
                text=content,
                mode=session.mode,
            )

            for response in responses:
                await session.send_json(response)

            # Back to listening after we're done
            await session.send_json({
                "type": "status",
                "state": "listening",
            })

    async def switch_mode(self, session_id: str, new_mode: str) -> None:
        """
        Switch between live / creative / navigator modes.
        This tears down the existing live connection and creates
        a new one with the appropriate config for the new mode.
        """
        valid_modes = {
            "live", "creative", "navigator",
            "code", "research", "language", "data",
            "music", "game", "meeting", "security",
            "fitness", "travel", "debate",
        }
        if new_mode not in valid_modes:
            session = self._get_session(session_id)
            await session.send_json({
                "type": "error",
                "message": f"Invalid mode: {new_mode}. Use one of: {valid_modes}",
            })
            return

        session = self._get_session(session_id)
        old_mode = session.mode
        session.mode = new_mode

        try:
            await self._agent.switch_mode(session_id, new_mode)

            # Update the video processor for the new mode's FPS config
            if session.video_processor:
                session.video_processor.set_mode(new_mode)

            # Reconnect live session with new mode's config
            # (different system instruction, tools, modalities)
            if session.live_connection:
                # Cancel relay first
                if session.relay_task and not session.relay_task.done():
                    session.relay_task.cancel()
                    try:
                        await session.relay_task
                    except asyncio.CancelledError:
                        pass
                    except Exception as relay_err:
                        logger.debug(f"Relay task cleanup error: {relay_err}")

                await session.live_connection.disconnect()
                session.live_connection = None

            # Set up fresh live connection with new mode's config
            await self._setup_live_connection(session)

            await session.send_json({
                "type": "status",
                "state": "listening",
                "mode": new_mode,
                "message": f"Switched from {old_mode} to {new_mode}",
            })
        except Exception as e:
            logger.error(f"Error switching mode for session {session_id}: {e}", exc_info=True)
            # Revert mode in session state if it failed
            session.mode = old_mode
            await session.send_json({
                "type": "error",
                "message": f"Failed to switch to {new_mode}. Staying in {old_mode}. Error: {str(e)}",
            })
            await session.send_json({
                "type": "status",
                "state": "listening",
                "mode": old_mode,
            })

    async def handle_interrupt(self, session_id: str) -> None:
        """
        Handle barge-in — user started talking while the agent
        was responding. We signal the live connection to stop output.
        """
        session = self._get_session(session_id)
        session.is_interrupted = True
        session.is_speaking = False

        # Tell the live connection to drain its queue
        if session.live_connection:
            await session.live_connection.interrupt()

        await self._agent.interrupt(session_id)

        await session.send_json({
            "type": "status",
            "state": "interrupted",
            "message": "User interruption detected."
        })

    async def update_config(
        self, session_id: str, settings: dict[str, Any]
    ) -> None:
        """Update session configuration (voice, language, etc.)."""
        session = self._get_session(session_id)
        session.config.update(settings)

        await self._agent.update_config(session_id, settings)

        await session.send_json({
            "type": "status",
            "state": "listening",
            "message": "Configuration updated",
        })
