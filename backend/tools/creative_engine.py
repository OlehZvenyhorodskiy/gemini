"""
Creative Engine — orchestrates interleaved text + image generation.

This is the backbone of the Creative Storyteller mode. Rather than
just dumping a wall of text, it breaks content into "scenes" where
each scene = a text block + an optional generated image.

The whole thing streams incrementally, so the user sees text appearing
followed by an image, then more text — feels alive and dynamic.
"""

import asyncio
import base64
import logging
from typing import Any, AsyncGenerator

from google import genai
from google.genai import types

logger = logging.getLogger("nexus.creative")

# Flash is fast enough for creative text, Pro only if quality matters more
MODEL_CREATIVE = "gemini-2.5-flash"
MODEL_IMAGE = "gemini-2.0-flash-exp"


class CreativeEngine:
    """
    Generates multi-scene creative content with interleaved text and images.

    Usage:
        engine = CreativeEngine(api_key="...")
        async for chunk in engine.generate_story("A robot discovers music"):
            # chunk is a dict: {"type": "text", "content": "..."} or
            #                  {"type": "image", "data": "...", "mime": "..."}
            send_to_client(chunk)
    """

    def __init__(self, client: genai.Client) -> None:
        self._client = client
        logger.info("CreativeEngine initialized")

    async def generate_story(
        self,
        prompt: str,
        style: str = "vivid and cinematic",
        num_scenes: int = 3,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Generate a multi-scene story with inline images.

        Yields dicts of type "text", "image", or "status" as it goes.
        The story is generated in one shot, then images are created
        for key visual moments.
        """
        logger.info(f"Generating story: '{prompt}' ({num_scenes} scenes, style: {style})")

        # Step 1: generate the full story with image cues
        story_prompt = f"""Write a creative story based on this prompt: "{prompt}"

Structure the story into exactly {num_scenes} scenes/sections.
For each scene:
1. Write 2-4 paragraphs of vivid, engaging narrative
2. End each scene with a line starting with [IMAGE: ...] describing the perfect illustration for that scene

Style: {style}

Format each scene like:
## Scene 1: [Title]
[narrative text]
[IMAGE: detailed description of the illustration]

## Scene 2: [Title]
...and so on.
"""

        yield {"type": "status", "state": "thinking", "message": "Crafting your story..."}

        try:
            response = self._client.models.generate_content(
                model=MODEL_CREATIVE,
                contents=story_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.9,
                    max_output_tokens=4096,
                ),
            )

            if not response.candidates or not response.candidates[0].content:
                yield {"type": "error", "message": "Story generation returned empty."}
                return

            full_text = response.candidates[0].content.parts[0].text

        except Exception as e:
            logger.error(f"Story generation failed: {e}")
            yield {"type": "error", "message": f"Story generation failed: {str(e)}"}
            return

        # Step 2: parse scenes and stream text + images
        scenes = self._parse_scenes(full_text)

        for i, scene in enumerate(scenes):
            # Stream the text part
            yield {
                "type": "text",
                "content": scene["text"],
            }

            # If there's an image description, generate it
            if scene.get("image_prompt"):
                yield {
                    "type": "status",
                    "state": "thinking",
                    "message": f"Illustrating scene {i + 1}...",
                }

                image_result = await self._generate_image(
                    scene["image_prompt"], style
                )
                if image_result:
                    yield image_result

                # Small pause between scenes so the UI doesn't feel rushed
                await asyncio.sleep(0.3)

        yield {"type": "status", "state": "listening"}

    async def generate_content(
        self,
        prompt: str,
        content_type: str = "story",
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        More general creative content — social posts, poems,
        marketing copy, etc. Single text + optional image.
        """
        yield {"type": "status", "state": "thinking"}

        type_instructions = {
            "story": "Write a short, compelling story",
            "poem": "Write a beautiful, evocative poem",
            "social_post": "Write an engaging social media post with hashtags",
            "marketing": "Write compelling marketing copy with a call to action",
            "song": "Write song lyrics with verse/chorus structure",
        }

        instruction = type_instructions.get(content_type, "Write creative content")

        try:
            response = self._client.models.generate_content(
                model=MODEL_CREATIVE,
                contents=f"{instruction} about: {prompt}",
                config=types.GenerateContentConfig(
                    temperature=0.9,
                    max_output_tokens=2048,
                ),
            )

            if response.candidates and response.candidates[0].content:
                text = response.candidates[0].content.parts[0].text
                yield {"type": "text", "content": text}

                # Generate an accompanying image
                image_result = await self._generate_image(
                    f"Artistic illustration for: {prompt}", "digital art"
                )
                if image_result:
                    yield image_result

        except Exception as e:
            logger.error(f"Content generation failed: {e}")
            yield {"type": "error", "message": f"Generation failed: {str(e)}"}

        yield {"type": "status", "state": "listening"}

    def _parse_scenes(self, text: str) -> list[dict[str, str]]:
        """
        Break the story text into scenes, extracting image prompts.
        Looks for [IMAGE: ...] markers at the end of each scene.
        """
        scenes = []
        current_text = []
        current_image = ""

        for line in text.split("\n"):
            stripped = line.strip()

            # Check if this line is an image cue
            if stripped.startswith("[IMAGE:") and stripped.endswith("]"):
                current_image = stripped[7:-1].strip()
            elif stripped.startswith("## Scene") and current_text:
                # New scene boundary — save the previous one
                scenes.append({
                    "text": "\n".join(current_text).strip(),
                    "image_prompt": current_image,
                })
                current_text = [line]
                current_image = ""
            else:
                current_text.append(line)

        # Don't forget the last scene
        if current_text:
            scenes.append({
                "text": "\n".join(current_text).strip(),
                "image_prompt": current_image,
            })

        return scenes

    async def _generate_image(
        self, prompt: str, style: str
    ) -> dict[str, Any] | None:
        """
        Generate a single image using Gemini's vision model.
        Returns an image dict or None if generation fails.
        """
        try:
            response = self._client.models.generate_content(
                model=MODEL_IMAGE,
                contents=f"Generate an image: {prompt}. Style: {style}",
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                ),
            )

            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        img_b64 = base64.b64encode(
                            part.inline_data.data
                        ).decode("utf-8")
                        return {
                            "type": "image",
                            "data": img_b64,
                            "mime": part.inline_data.mime_type,
                        }

            logger.warning("Image generation returned no image data")
            return None

        except Exception as e:
            logger.error(f"Image generation error: {e}")
            return None
