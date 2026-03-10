"""
Audio Handler — manages PCM audio chunk processing.

Handles the conversion, buffering, and streaming of audio data
between the browser client and Gemini Live API.

Input: 16-bit PCM, 16kHz, mono (from browser AudioWorklet)
Output: 24kHz PCM (from Gemini, played back in browser)
"""

import base64
import logging
import struct
from io import BytesIO
from typing import Optional

logger = logging.getLogger("nexus.audio")

# Audio format constants for Gemini Live API
INPUT_SAMPLE_RATE = 16000       # 16kHz — what Gemini expects
INPUT_CHANNELS = 1              # Mono
INPUT_SAMPLE_WIDTH = 2          # 16-bit = 2 bytes per sample

OUTPUT_SAMPLE_RATE = 24000      # 24kHz — what Gemini outputs
OUTPUT_CHANNELS = 1
OUTPUT_SAMPLE_WIDTH = 2

# Chunk size settings
CHUNK_DURATION_MS = 100         # 100ms chunks — sweet spot for latency vs overhead
INPUT_CHUNK_SIZE = int(INPUT_SAMPLE_RATE * INPUT_CHANNELS * INPUT_SAMPLE_WIDTH * CHUNK_DURATION_MS / 1000)


class AudioBuffer:
    """
    Accumulates incoming PCM audio chunks and provides them
    in properly sized pieces for the Live API.
    """

    def __init__(self) -> None:
        self._buffer = BytesIO()
        self._total_bytes = 0

    def append(self, audio_data: bytes) -> None:
        """Add raw PCM bytes to the buffer."""
        self._buffer.write(audio_data)
        self._total_bytes += len(audio_data)

    def get_chunks(self, chunk_size: int = INPUT_CHUNK_SIZE) -> list[bytes]:
        """
        Pull complete chunks out of the buffer.
        Any leftover bytes stay buffered for the next call.
        """
        self._buffer.seek(0)
        data = self._buffer.read()

        chunks: list[bytes] = []
        offset = 0
        while offset + chunk_size <= len(data):
            chunks.append(data[offset:offset + chunk_size])
            offset += chunk_size

        # Keep leftover bytes
        leftover = data[offset:]
        self._buffer = BytesIO()
        self._buffer.write(leftover)

        return chunks

    def clear(self) -> None:
        """Dump the buffer — used on interruption."""
        self._buffer = BytesIO()
        self._total_bytes = 0

    @property
    def duration_seconds(self) -> float:
        """How many seconds of audio are currently buffered."""
        return self._total_bytes / (INPUT_SAMPLE_RATE * INPUT_SAMPLE_WIDTH * INPUT_CHANNELS)


def encode_audio_for_ws(audio_bytes: bytes) -> str:
    """Encode raw PCM bytes to base64 for WebSocket transport."""
    return base64.b64encode(audio_bytes).decode("utf-8")


def decode_audio_from_ws(audio_b64: str) -> bytes:
    """Decode base64 audio from WebSocket to raw PCM bytes."""
    return base64.b64decode(audio_b64)


def calculate_audio_level(audio_bytes: bytes) -> float:
    """
    Calculate the RMS audio level of a PCM chunk.
    Returns a normalized float 0.0 → 1.0.
    Used by the frontend for the audio visualizer.
    """
    if not audio_bytes or len(audio_bytes) < 2:
        return 0.0

    num_samples = len(audio_bytes) // INPUT_SAMPLE_WIDTH
    if num_samples == 0:
        return 0.0

    # Unpack 16-bit signed integers
    samples = struct.unpack(f"<{num_samples}h", audio_bytes[:num_samples * 2])

    # RMS calculation
    sum_squares = sum(s * s for s in samples)
    rms = (sum_squares / num_samples) ** 0.5

    # Normalize to 0.0 → 1.0 (max int16 is 32767)
    normalized = min(rms / 32767.0, 1.0)

    return normalized
