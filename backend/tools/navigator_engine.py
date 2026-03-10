"""
Navigator Engine — Real headless browser automation via Playwright.

Swapped out the old pyautogui implementation for something that actually
works in a cloud deployment. Each user session gets its own isolated
BrowserContext so sessions don't collide. The AI can navigate URLs,
click elements by CSS selector, type text, scroll, and grab screenshots
of whatever it's looking at.

Runs headless by default — perfect for Cloud Run containers.
"""

import asyncio
import base64
import logging
from typing import Any, Optional

from playwright.async_api import async_playwright, Playwright, Browser, BrowserContext, Page

logger = logging.getLogger("nexus.navigator")


class NavigatorEngine:
    """
    Manages headless Chromium sessions using Playwright.

    Architecture decision here: one Browser instance shared across all
    sessions, but each user gets their own BrowserContext. Contexts are
    isolated (separate cookies, storage, etc.) so User A browsing Amazon
    won't leak cookies into User B's session.
    """

    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        # Maps session_id -> {"context": BrowserContext, "page": Page}
        self._sessions: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        logger.info("NavigatorEngine (Playwright) initialized")

    async def _ensure_browser(self) -> None:
        """Lazy-start the global Playwright + Chromium instance."""
        async with self._lock:
            if self._browser:
                return
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"],
            )
            logger.info("Playwright Chromium launched (headless)")

    async def start_session(self, session_id: str) -> None:
        """Spin up an isolated browser context for this user session."""
        await self._ensure_browser()

        if session_id in self._sessions:
            return  # Already running — don't double-create

        try:
            context = await self._browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36 NEXUS-AI/1.0"
                ),
            )
            page = await context.new_page()
            page.set_default_timeout(8000)

            self._sessions[session_id] = {"context": context, "page": page}
            logger.info(f"Browser session started: {session_id}")

        except Exception as exc:
            logger.error(f"Failed to start browser session {session_id}: {exc}")

    async def close_session(self, session_id: str) -> None:
        """Tear down the browser context for a session."""
        data = self._sessions.pop(session_id, None)
        if data:
            try:
                await data["context"].close()
            except Exception:
                pass
            logger.info(f"Browser session closed: {session_id}")

    async def shutdown(self) -> None:
        """Kill everything — called during server shutdown."""
        for sid in list(self._sessions.keys()):
            await self.close_session(sid)
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self._browser = None
        self._playwright = None
        logger.info("Playwright shut down")

    # ─── Page getter ───────────────────────────────────────────────

    def _get_page(self, session_id: str) -> Optional[Page]:
        """Grab the active page for a session, or None."""
        entry = self._sessions.get(session_id)
        if not entry:
            logger.warning(f"No browser session for {session_id}")
            return None
        return entry["page"]

    # ─── Public actions ────────────────────────────────────────────

    async def navigate(self, session_id: str, url: str) -> dict[str, Any]:
        """Navigate the browser to a URL and return a screenshot."""
        page = self._get_page(session_id)
        if not page:
            return {"status": "error", "message": "No browser session. Connect first."}

        try:
            # Prepend https if no scheme provided
            target = url if url.startswith("http") else f"https://{url}"
            await page.goto(target, wait_until="domcontentloaded")

            return {
                "status": "success",
                "url": page.url,
                "title": await page.title(),
                "screenshot": await self._screenshot_b64(page),
            }
        except Exception as exc:
            logger.error(f"Navigate failed: {exc}")
            return {"status": "error", "message": str(exc)}

    async def click_element(
        self,
        session_id: str,
        selector: str = "",
        x: int = 0,
        y: int = 0,
        description: str = "",
    ) -> dict[str, Any]:
        """Click by CSS selector (preferred) or raw coordinates (fallback)."""
        page = self._get_page(session_id)
        if not page:
            return {"status": "error", "message": "No browser session."}

        try:
            if selector:
                await page.click(selector)
            elif x > 0 and y > 0:
                await page.mouse.click(x, y)
            else:
                return {"status": "error", "message": "Provide a selector OR x/y coords."}

            # Brief pause so the UI settles before screenshot
            await asyncio.sleep(0.4)

            return {
                "status": "success",
                "action": "click",
                "target": selector or f"({x},{y})",
                "description": description,
                "screenshot": await self._screenshot_b64(page),
            }
        except Exception as exc:
            logger.error(f"Click failed: {exc}")
            return {"status": "error", "message": str(exc)}

    async def type_text(
        self, session_id: str, selector: str, text: str
    ) -> dict[str, Any]:
        """Fill an input field identified by CSS selector."""
        page = self._get_page(session_id)
        if not page:
            return {"status": "error", "message": "No browser session."}

        try:
            await page.fill(selector, text)
            return {
                "status": "success",
                "action": "type",
                "selector": selector,
                "text": text,
                "screenshot": await self._screenshot_b64(page),
            }
        except Exception as exc:
            logger.error(f"Type failed: {exc}")
            return {"status": "error", "message": str(exc)}

    async def scroll(
        self, session_id: str, direction: str = "down", amount: int = 400
    ) -> dict[str, Any]:
        """Scroll the viewport up or down by the given pixel amount."""
        page = self._get_page(session_id)
        if not page:
            return {"status": "error", "message": "No browser session."}

        try:
            pixels = amount if direction == "down" else -amount
            await page.evaluate(f"window.scrollBy(0, {pixels})")
            return {
                "status": "success",
                "action": "scroll",
                "direction": direction,
                "amount": amount,
                "screenshot": await self._screenshot_b64(page),
            }
        except Exception as exc:
            logger.error(f"Scroll failed: {exc}")
            return {"status": "error", "message": str(exc)}

    async def capture_screenshot(self, session_id: str) -> dict[str, Any]:
        """Grab the current viewport as a base64 JPEG."""
        page = self._get_page(session_id)
        if not page:
            return {
                "status": "error",
                "message": "No browser open. Ask me to navigate somewhere first.",
            }

        try:
            b64 = await self._screenshot_b64(page)
            return {
                "status": "success",
                "image_data": b64,
                "mime_type": "image/jpeg",
                "width": 1280,
                "height": 800,
            }
        except Exception as exc:
            logger.error(f"Screenshot failed: {exc}")
            return {"status": "error", "message": str(exc)}

    # ─── Internal helpers ──────────────────────────────────────────

    async def _screenshot_b64(self, page: Page) -> str:
        """Take a viewport screenshot and return it as a base64 string."""
        raw = await page.screenshot(type="jpeg", quality=70)
        return base64.b64encode(raw).decode("utf-8")
