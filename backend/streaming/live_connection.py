"""
Live Connection — persistent Gemini Live API session per client.

Each connected browser tab gets one of these. It holds a long-lived
WebSocket connection to Gemini's Multimodal Live API via the google-genai
SDK, pipes audio/video in, and relays responses back through an asyncio
queue that the session manager drains into the browser WebSocket.

The real meat of Phase 2 lives here — everything streams in both
directions simultaneously, and interruption happens automatically when
the user starts talking over the model.
"""

import asyncio
import base64
import logging
import uuid
from typing import Any, Callable, Awaitable, Optional

from google import genai
from google.genai import types

logger = logging.getLogger("nexus.live")

# The model specifically designed for real-time audio conversations
LIVE_MODEL = "gemini-2.5-flash-native-audio-latest"

# Fallback if native audio model isn't available on the account
LIVE_MODEL_FALLBACK = "gemini-2.5-flash-native-audio-preview-12-2025"


class LiveConnection:
    """
    Wraps a single Gemini Live API session.

    Lifecycle:
      1. __init__ — stash config, nothing connects yet
      2. connect() — opens the persistent bidi session
      3. send_audio() / send_video() — pipe media in real-time
      4. _receive_loop() — background task pulling responses
      5. disconnect() — clean shutdown

    The output_queue holds dicts ready to be sent over the browser
    WebSocket as JSON. The session manager pops from it continuously.
    """

    def __init__(
        self,
        api_key: str,
        system_instruction: str,
        tools: list[dict[str, Any]] | None = None,
        response_modalities: list[str] | None = None,
        tool_executor: Optional[Callable[[str, dict], Awaitable[dict]]] = None,
        voice_name: str = "Aoede",
    ) -> None:
        self._api_key = api_key
        self._system_instruction = system_instruction
        self._tools = tools
        self._response_modalities = response_modalities or ["AUDIO"]
        self._tool_executor = tool_executor
        self._voice_name = voice_name

        # GenAI client — one per connection is fine, they're lightweight
        self._client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})

        # The live session handle from the SDK
        self._session: Any = None
        self._session_context: Any = None

        # Background receive task
        self._receive_task: Optional[asyncio.Task] = None

        # Queue for outbound messages → browser WebSocket
        self.output_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        # Flags
        self._connected = False
        self._interrupted = False

        logger.info(f"LiveConnection created with voice '{voice_name}' (not yet connected)")

    async def connect(self) -> None:
        """
        Start the persistent connection loop.
        This spawns a background task that maintains the session,
        automatically reconnecting if the connection drops.
        """
        if self._receive_task and not self._receive_task.done():
            logger.warning("Already running, skipping duplicate connect()")
            return

        self._connected = True
        self._receive_task = asyncio.create_task(
            self._run_connection_loop(),
            name="live-connection-loop",
        )
        logger.info("LiveConnection loop started")

    async def disconnect(self) -> None:
        """
        Stop the connection loop and close everything.
        """
        self._connected = False
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None
        
        # storage cleanup handled by context manager exit in loop
        logger.info("LiveConnection disconnected")

    async def send_audio(self, audio_data: bytes) -> None:
        """
        Stream audio chunk to the model.
        """
        if not self._connected or not self._session:
            return

        try:
            await self._session.send(
                input={"mime_type": "audio/pcm;rate=16000", "data": audio_data},
                end_of_turn=False,
            )
        except Exception as e:
            logger.debug(f"Error sending audio: {e}")

    async def send_video(self, frame_bytes: bytes) -> None:
        """
        Stream a video frame (raw JPEG bytes) to the model.
        The session manager already handles base64 decoding, so
        we receive plain bytes here — no double-decode needed.
        """
        if not self._connected or not self._session:
            return

        try:
            await self._session.send(
                input={"mime_type": "image/jpeg", "data": frame_bytes},
                end_of_turn=False,
            )
        except Exception as e:
            logger.debug(f"Error sending video frame: {e}")

    async def send_text(self, text: str) -> None:
        """
        Send a text message into the live session.
        Useful when the user types instead of speaking.
        """
        if not self._connected or not self._session:
            return

        try:
            await self._session.send(input=text, end_of_turn=True)
        except Exception as e:
            logger.error(f"Error sending text to Live API: {e}")
            await self.output_queue.put({
                "type": "error",
                "message": f"Text send error: {str(e)}",
            })

    async def interrupt(self) -> None:
        """
        Flag the current turn as interrupted.
        The receive loop checks this flag and stops relaying audio/text
        from the current turn once it is set.
        """
        self._interrupted = True
        logger.info("LiveConnection turn interrupted by user")

    async def _run_connection_loop(self) -> None:
        """
        Main loop that maintains the Gemini Live session.
        Auto-reconnects on failure with exponential backoff.
        """
        retry_count = 0
        max_retries = 5
        base_delay = 1.0

        while self._connected:
            try:
                # Choose model
                model_id = LIVE_MODEL

                # Build config for native audio model compatibility
                config = {
                    "generation_config": {
                        "response_modalities": self._response_modalities,
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": self._voice_name
                                }
                            }
                        }
                    },
                }

                if self._system_instruction:
                    config["system_instruction"] = {"parts": [{"text": self._system_instruction}]}

                if self._tools:
                    config["tools"] = self._tools

                try:
                    logger.info(f"Connecting to Gemini Live ({model_id})...")
                    async with self._client.aio.live.connect(
                        model=model_id,
                        config=config,
                    ) as session:
                        self._session = session
                        self._interrupted = False
                        retry_count = 0  # Reset on successful connection
                        
                        # Notify frontend
                        await self.output_queue.put({
                            "type": "status",
                            "state": "listening",
                            "message": f"Connected to Gemini Live ({model_id})",
                        })

                        # Process messages until session ends or error
                        await self._handle_session_messages(session)

                except Exception as e:
                    logger.warning(f"Session with {model_id} failed: {e}")
                    # Try fallback model if native audio failed immediately
                    if "404" in str(e) or "not found" in str(e).lower():
                        logger.info(f"Falling back to {LIVE_MODEL_FALLBACK}")
                        async with self._client.aio.live.connect(
                            model=LIVE_MODEL_FALLBACK,
                            config=config,
                        ) as session:
                            self._session = session
                            retry_count = 0
                            await self.output_queue.put({
                                "type": "status",
                                "state": "listening",
                                "message": f"Connected ({LIVE_MODEL_FALLBACK})",
                            })
                            await self._handle_session_messages(session)
                    else:
                        raise e

            except asyncio.CancelledError:
                logger.info("Connection loop cancelled")
                break

            except Exception as e:
                if not self._connected:
                    break
                
                retry_count += 1
                delay = min(base_delay * (2 ** (retry_count - 1)), 30.0)
                
                logger.error(
                    f"Connection error (attempt {retry_count}): {e}. "
                    f"Retrying in {delay}s..."
                )
                
                await self.output_queue.put({
                    "type": "error",
                    "message": f"Connection lost. Retrying in {int(delay)}s...",
                })
                
                await asyncio.sleep(delay)

        self._session = None

    async def _handle_session_messages(self, session: Any) -> None:
        """
        Process messages for a single active session.
        Returns when the session closes or errors.

        Perf note: we only send status:speaking ONCE per turn,
        not per audio chunk. The old approach flooded the WebSocket
        with dozens of status messages per second, hammering the
        frontend with re-renders and causing visible lag.
        """
        while True:
            turn = session.receive()
            turn_id = str(uuid.uuid4())[:8]
            is_speaking_this_turn = False

            async for response in turn:
                # Check for client-side interrupt flag
                if self._interrupted:
                    self._interrupted = False
                    is_speaking_this_turn = False
                    continue

                if response.server_content is None:
                    continue

                # 1. Handle model text/audio output
                model_turn = response.server_content.model_turn
                if model_turn:
                    for part in model_turn.parts:
                        if part.inline_data and isinstance(part.inline_data.data, bytes):
                            # Audio chunk — send it for playback
                            audio_bytes = part.inline_data.data
                            
                            # CRITICAL FIX: Detect and fix double Base64 encoding (occurs in some SDK versions)
                            try:
                                # If it looks like printable ASCII, it's likely double-encoded base64 string
                                if len(audio_bytes) > 0:
                                    sample = audio_bytes[:20]
                                    if all(32 <= b <= 126 for b in sample):
                                        audio_bytes = base64.b64decode(audio_bytes)
                                        logger.debug("Detected and corrected double base64 encoding")
                            except Exception:
                                pass # Use original if decoding fails

                            b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
                            await self.output_queue.put({
                                "type": "audio",
                                "data": b64_audio,
                            })
                            # Only notify "speaking" once per turn
                            if not is_speaking_this_turn:
                                is_speaking_this_turn = True
                                await self.output_queue.put({
                                    "type": "status",
                                    "state": "speaking",
                                })
                        elif part.text:
                            # Skip internal thinking/thought parts from being sent to UI
                            if getattr(part, "thought", False):
                                continue
                            
                            await self.output_queue.put({
                                "type": "text",
                                "content": part.text,
                                "turn_id": turn_id
                            })
                        elif part.function_call:
                            await self._handle_tool_call(session, part.function_call)

                # 2. Handle turn completion (done speaking)
                if response.server_content.turn_complete:
                    is_speaking_this_turn = False
                    await self.output_queue.put({
                        "type": "status",
                        "state": "listening",
                    })

                # 3. Handle server-side interruption (VAD)
                if response.server_content.interrupted:
                    logger.info("Server detected barge-in")
                    is_speaking_this_turn = False
                    await self._drain_audio_queue()
                    await self.output_queue.put({
                        "type": "status",
                        "state": "listening",
                    })

    async def _handle_tool_call(self, session: Any, fc: Any) -> None:
        """Execute tool and send response back to session."""
        args = dict(fc.args) if fc.args else {}
        name = fc.name
        
        await self.output_queue.put({
            "type": "tool_call",
            "name": name,
            "args": args,
        })

        if not self._tool_executor:
            return

        try:
            result = await self._tool_executor(name, args)
            
            # Send result to frontend
            await self.output_queue.put({
                "type": "tool_result",
                "name": name,
                "result": result,
            })
            
            # Synchronous Storyteller interception: If tool returned an image, broadcast it immediately!
            if isinstance(result, dict) and result.get("type") == "image":
                await self.output_queue.put(result)
            
            # Send result back to Gemini
            await session.send_tool_response(
                function_responses=[
                    types.FunctionResponse(
                        name=name,
                        response=result,
                    )
                ]
            )
        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            await session.send_tool_response(
                function_responses=[
                    types.FunctionResponse(
                        name=name,
                        response={"error": str(e)},
                    )
                ]
            )

    async def _drain_audio_queue(self) -> None:
        """
        Atomically drain all audio chunks by creating a new queue.
        This is the only truly race-safe method.
        """
        old_queue = self.output_queue
        self.output_queue = asyncio.Queue()
        
        drained = 0
        while not old_queue.empty():
            try:
                msg = old_queue.get_nowait()
                if msg.get("type") != "audio":
                    await self.output_queue.put(msg)
                else:
                    drained += 1
            except asyncio.QueueEmpty:
                break
        
        if drained > 0:
            logger.info(f"Drained {drained} audio chunks on barge-in")

    @property
    def is_connected(self) -> bool:
        """Check if the live session is still active."""
        return self._connected and self._session is not None
