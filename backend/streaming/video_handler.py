"""
Video Handler — mode-aware JPEG frame processing for Gemini vision.

Handles capture, resizing, and encoding of video frames from:
- User's webcam (Live Agent mode)
- Screen share / screenshots (UI Navigator mode)

Key upgrade: FPS is now mode-aware. Navigator gets 15fps for smooth
screen tracking, creative gets 2fps (just needs stills), and the
rest sit at a comfortable 5fps balance.
"""

import base64
import logging
import time
from io import BytesIO
from typing import Optional

from PIL import Image

logger = logging.getLogger("nexus.video")

# ============================================================
# Per-mode video configuration
# ============================================================
# Navigator/Security need HIGH frame rates for responsive screen
# tracking — the user expects near-instant visual feedback when
# clicking buttons or scrolling. Creative only needs occasional
# stills for inspiration. Everything else gets a balanced 5fps.

MODE_VIDEO_CONFIG: dict[str, dict] = {
    "navigator": {
        "target_fps": 15,
        "max_resolution": 512,    # Smaller res = fewer tokens per frame
        "jpeg_quality": 60,       # Lower quality saves bandwidth at 15fps
    },
    "security": {
        "target_fps": 15,
        "max_resolution": 512,
        "jpeg_quality": 60,
    },
    "code": {
        "target_fps": 5,
        "max_resolution": 768,    # Code needs readable text = higher res
        "jpeg_quality": 80,
    },
    "creative": {
        "target_fps": 2,
        "max_resolution": 768,
        "jpeg_quality": 85,       # Best quality for visual inspiration
    },
    "data": {
        "target_fps": 5,
        "max_resolution": 768,
        "jpeg_quality": 80,
    },
}

# Fallback for modes not in the config above
DEFAULT_VIDEO_CONFIG = {
    "target_fps": 5,
    "max_resolution": 768,
    "jpeg_quality": 80,
}


class VideoProcessor:
    """
    Processes and throttles video frames before sending
    them to Gemini for visual analysis.

    Now mode-aware: call set_mode() when the user switches
    modes and the processor will adapt its FPS, resolution,
    and quality targets automatically.
    """

    def __init__(self, mode: str = "live") -> None:
        self._last_frame_time: float = 0.0
        self._frame_count: int = 0
        self._mode = mode
        self._config = MODE_VIDEO_CONFIG.get(mode, DEFAULT_VIDEO_CONFIG)

    def set_mode(self, mode: str) -> None:
        """
        Switch to a new mode's video config.
        Called by SessionManager when the user switches agent modes.
        """
        self._mode = mode
        self._config = MODE_VIDEO_CONFIG.get(mode, DEFAULT_VIDEO_CONFIG)
        logger.info(
            f"VideoProcessor switched to {mode}: "
            f"{self._config['target_fps']}fps, "
            f"{self._config['max_resolution']}px, "
            f"q{self._config['jpeg_quality']}"
        )

    @property
    def target_fps(self) -> int:
        return self._config["target_fps"]

    @property
    def min_frame_interval(self) -> float:
        return 1.0 / self._config["target_fps"]

    def should_process_frame(self) -> bool:
        """
        Rate-limit frames to the current mode's target FPS.
        """
        now = time.time()
        if now - self._last_frame_time >= self.min_frame_interval:
            return True
        return False

    def process_frame(self, frame_data: bytes) -> Optional[bytes]:
        """
        Resize and compress a JPEG frame for Gemini.

        Takes raw JPEG bytes from the browser, makes sure they're
        within the mode's resolution limit, and returns optimized JPEG bytes.
        Returns None if the frame should be skipped (rate limiting).
        """
        if not self.should_process_frame():
            return None

        max_res = self._config["max_resolution"]
        quality = self._config["jpeg_quality"]

        try:
            img = Image.open(BytesIO(frame_data))

            # Resize maintaining aspect ratio, capped at mode's max resolution
            width, height = img.size
            if width > max_res or height > max_res:
                ratio = min(max_res / width, max_res / height)
                new_width = int(width * ratio)
                new_height = int(height * ratio)
                img = img.resize((new_width, new_height), Image.LANCZOS)

            # Convert to RGB if needed (handles RGBA, palette modes, etc.)
            if img.mode != "RGB":
                img = img.convert("RGB")

            # Encode back to JPEG with mode-specific quality
            output = BytesIO()
            img.save(output, format="JPEG", quality=quality, optimize=True)
            processed_bytes = output.getvalue()

            # Update timing
            self._last_frame_time = time.time()
            self._frame_count += 1

            if self._frame_count % 50 == 0:
                logger.debug(
                    f"Frame #{self._frame_count} ({self._mode}): "
                    f"{width}x{height} → {img.size[0]}x{img.size[1]}, "
                    f"{len(processed_bytes)} bytes @ q{quality}"
                )

            return processed_bytes

        except Exception as e:
            logger.error(f"Frame processing failed: {e}")
            return None

    @property
    def frame_count(self) -> int:
        """Number of frames processed so far."""
        return self._frame_count


def encode_frame_for_ws(frame_bytes: bytes) -> str:
    """Base64-encode a JPEG frame for WebSocket transport."""
    return base64.b64encode(frame_bytes).decode("utf-8")


def decode_frame_from_ws(frame_b64: str) -> bytes:
    """Decode a base64 JPEG frame from WebSocket."""
    return base64.b64decode(frame_b64)
