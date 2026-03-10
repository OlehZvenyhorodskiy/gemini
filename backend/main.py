"""
NEXUS Backend — FastAPI WebSocket Relay Server

The main entry point for the NEXUS backend. Spins up a FastAPI app with:
- WebSocket endpoint (/ws) for bidirectional audio/video/text streaming
- Health check endpoint (/health) for Cloud Run
- Static file serving for the built Next.js frontend
- CORS configuration for local dev

This server acts as a relay between the browser client and the Gemini
Multimodal Live API, proxied through Google ADK for session management,
tool orchestration, and multi-agent coordination.
"""

import sys
import asyncio

if sys.platform == "win32":
    asyncio.WindowsSelectorEventLoopPolicy = asyncio.WindowsProactorEventLoopPolicy
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError
from dotenv import load_dotenv

# Pull in .env for local dev — Cloud Run injects these at runtime
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from backend.streaming.session_manager import SessionManager
from backend.streaming.models import (
    ClientMessage, ClientAudioMessage, ClientVideoMessage, ClientTextMessage,
    ClientModeMessage, ClientInterruptMessage, ClientConfigMessage
)

client_message_adapter = TypeAdapter(ClientMessage)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("nexus.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup / shutdown lifecycle hook.
    We initialize the session manager here so it's ready before
    any WebSocket connection comes in.
    """
    logger.info("🚀 NEXUS backend starting up...")
    app.state.session_manager = SessionManager()
    yield
    logger.info("🛑 NEXUS backend shutting down...")
    await app.state.session_manager.cleanup()


app = FastAPI(
    title="NEXUS — Multimodal AI Agent",
    description="Backend relay for Gemini Live Agent Challenge",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — wide open during dev, tighten for prod
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """
    Cloud Run pings this to know the container is alive.
    Also handy for uptime monitors and the deployment proof recording.
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "service": "nexus-agent",
            "version": "1.0.0",
        }
    )


@app.get("/api/config")
async def get_config() -> JSONResponse:
    """
    Returns non-secret configuration to the frontend.
    The frontend doesn't need the API key — all Gemini traffic
    flows through this relay server.
    """
    return JSONResponse(
        content={
            "modes": [
                "live", "creative", "navigator",
                "code", "research", "language", "data",
                "music", "game", "meeting", "security",
            ],
            "default_mode": "live",
            "supported_audio_format": {
                "sample_rate": 16000,
                "channels": 1,
                "encoding": "pcm_s16le",
            },
            "video_config": {
                "max_fps": 1,
                "format": "jpeg",
                "max_resolution": 768,
            },
        }
    )


@app.get("/api/sessions")
async def list_sessions() -> JSONResponse:
    """
    List recent sessions for the 'Continue conversation' feature.
    Returns empty array if Firestore isn't configured.
    """
    session_manager: SessionManager = app.state.session_manager
    sessions = await session_manager.firestore.list_sessions(limit=20)
    return JSONResponse(content={"sessions": sessions})


@app.get("/api/session/{session_id}/history")
async def get_session_history(session_id: str) -> JSONResponse:
    """
    Load conversation history for a specific session.
    Used when the user wants to resume a previous conversation.
    """
    session_manager: SessionManager = app.state.session_manager
    history = await session_manager.firestore.load_history(session_id, limit=100)
    return JSONResponse(content={"session_id": session_id, "history": history})


@app.get("/api/user/{user_id}/profile")
async def get_user_profile(user_id: str) -> JSONResponse:
    """
    Load the persistent facts and memory for a specific user.
    """
    session_manager: SessionManager = app.state.session_manager
    facts = await session_manager.firestore.get_user_profile(user_id)
    return JSONResponse(content={"user_id": user_id, "facts": facts})


async def _handle_mode(
    session_manager: SessionManager, session_id: str, message: ClientModeMessage
) -> None:
    """Thin wrapper to log + delegate mode switches."""
    await session_manager.switch_mode(session_id, message.mode)
    logger.info(f"🔄 Session {session_id} switched to mode: {message.mode}")


async def _handle_interrupt(
    session_manager: SessionManager, session_id: str, message: ClientInterruptMessage
) -> None:
    """Thin wrapper to log + delegate barge-in."""
    await session_manager.handle_interrupt(session_id)
    logger.info(f"⛔ Session {session_id} interrupted")


async def _handle_config(
    session_manager: SessionManager, session_id: str, message: ClientConfigMessage
) -> None:
    """Thin wrapper to delegate config updates."""
    await session_manager.update_config(session_id, message.settings)


# ---------------------------------------------------------------------------
# Command Router — maps each Pydantic message type to its async handler.
# Adding a new message type? Just register it here. Zero if/elif needed.
# Each handler signature: (session_manager, session_id, message) -> None
# ---------------------------------------------------------------------------
MESSAGE_HANDLERS: dict[type, Any] = {
    ClientAudioMessage: lambda sm, sid, msg: sm.handle_audio(sid, msg),
    ClientVideoMessage: lambda sm, sid, msg: sm.handle_video(sid, msg),
    ClientTextMessage: lambda sm, sid, msg: sm.handle_text(sid, msg),
    ClientModeMessage: _handle_mode,
    ClientInterruptMessage: _handle_interrupt,
    ClientConfigMessage: _handle_config,
}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    Main bidirectional WebSocket endpoint.

    Protocol messages (JSON):
    Client → Server:
        { "type": "audio", "data": "<base64 PCM 16kHz>" }
        { "type": "video", "data": "<base64 JPEG frame>" }
        { "type": "text", "content": "user message" }
        { "type": "mode", "mode": "live" | "creative" | "navigator" }
        { "type": "interrupt" }
        { "type": "config", "settings": {...} }

    Server → Client:
        { "type": "audio", "data": "<base64 PCM 24kHz>" }
        { "type": "text", "content": "agent response chunk" }
        { "type": "image", "data": "<base64 image>", "mime": "image/png" }
        { "type": "status", "state": "listening" | "thinking" | "speaking" }
        { "type": "tool_call", "name": "...", "args": {...} }
        { "type": "tool_result", "name": "...", "result": {...} }
        { "type": "error", "message": "..." }
    """
    await websocket.accept()
    session_manager: SessionManager = app.state.session_manager
    session_id: str | None = None
    user_id = websocket.query_params.get("user_id", "anonymous")

    try:
        # Try to reconnect to an existing session if one is in grace period
        requested_session = websocket.query_params.get("session_id")
        if requested_session:
            session_id = await session_manager.reconnect_session(
                requested_session, websocket
            )

        # Fall back to creating a brand-new session
        if not session_id:
            session_id = await session_manager.create_session(websocket, user_id)

        logger.info(f"✅ Client connected, session: {session_id}, user: {user_id}")

        # Send initial config to client
        await websocket.send_json({
            "type": "status",
            "state": "listening",
            "session_id": session_id,
        })

        # Main message loop — runs until client disconnects
        while True:
            raw_message = await websocket.receive_text()

            try:
                message = client_message_adapter.validate_json(raw_message)
            except ValidationError as e:
                logger.error(f"Validation error: {e.errors()}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid message format",
                })
                continue

            # Route to the correct handler via the command dispatcher
            handler = MESSAGE_HANDLERS.get(type(message))
            if handler:
                await handler(session_manager, session_id, message)
            else:
                logger.warning(f"No handler for message type: {type(message).__name__}")

    except WebSocketDisconnect:
        logger.info(f"👋 Client disconnected, session: {session_id}")
    except json.JSONDecodeError as e:
        logger.error(f"Malformed JSON from client: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Invalid JSON format",
        })
    except Exception as e:
        import traceback
        logger.error(f"💥 Unexpected error in session {session_id}: {repr(e)}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Server error: {traceback.format_exc()}",
            })
        except Exception:
            pass  # Client probably already gone
    finally:
        if session_id:
            await session_manager.close_session(session_id)


# Serve the built Next.js frontend if the directory exists
# (only in production / Docker container)
frontend_path = Path(__file__).parent.parent / "frontend" / "out"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
    logger.info(f"📦 Serving frontend from {frontend_path}")
