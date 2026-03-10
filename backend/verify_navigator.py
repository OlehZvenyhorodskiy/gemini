"""Quick smoke test for the Playwright-based NavigatorEngine."""

import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.tools.navigator_engine import NavigatorEngine

logging.basicConfig(level=logging.INFO, format="%(name)s | %(message)s")
logger = logging.getLogger("verify")


async def main() -> None:
    engine = NavigatorEngine()
    sid = "test-session"

    try:
        await engine.start_session(sid)
        logger.info("Session started")

        result = await engine.navigate(sid, "https://example.com")
        logger.info(f"Navigate: status={result['status']}, title={result.get('title')}")

        if result["status"] == "success":
            shot = await engine.capture_screenshot(sid)
            logger.info(f"Screenshot: {len(shot.get('image_data', ''))} chars (b64)")
            logger.info("ALL CHECKS PASSED")
        else:
            logger.error(f"Navigate failed: {result.get('message')}")

    except Exception as exc:
        logger.error(f"FAILED: {exc}", exc_info=True)

    finally:
        await engine.close_session(sid)
        await engine.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
