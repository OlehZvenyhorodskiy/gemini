"""
NEXUS Base Agent — shared constants, session state, and common tool declarations.

Houses the building blocks that every agent mode needs: the AgentSession
dataclass, model selection constants, mode-to-base routing map, and the
common tool declarations (search, memory, UI mutation, cross-agent consult,
widget rendering) available to all modes.
"""

import logging
import os
from typing import Any

from google.genai import types

logger = logging.getLogger("nexus.agent")

# API configuration — set via .env locally or Cloud Run env vars
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")

# Model choices — Flash for speed in Live mode, Pro for deep reasoning
MODEL_FLASH = "gemini-2.5-flash"
MODEL_PRO = "gemini-2.5-pro"

# Maps every mode slug to its base mode for live connection routing.
# The specialized modes ride on top of the 3 base modes but with
# their own system instructions and personas.
MODE_TO_BASE: dict[str, str] = {
    "live": "live",
    "creative": "creative",
    "navigator": "navigator",
    "code": "live",
    "research": "live",
    "language": "live",
    "data": "live",
    "music": "creative",
    "game": "creative",
    "meeting": "live",
    "security": "navigator",
    "fitness": "live",
    "travel": "live",
    "debate": "live",
}


class AgentSession:
    """
    Holds per-session state for one connected user.
    Tracks conversation history, current mode, model config,
    and the agent's "physical world memory" (observed facts).
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.mode = "live"
        self.history: list[types.Content] = []
        self.config: dict[str, Any] = {}
        self.memory: list[str] = []
        self.is_active = True


def get_model_for_mode(mode: str) -> str:
    """Pick the right model based on the mode — Flash for speed, Pro for depth."""
    base = MODE_TO_BASE.get(mode, "live")
    if base == "creative":
        return MODEL_PRO  # Creative-family needs deeper reasoning
    return MODEL_FLASH  # Everything else needs low latency


def build_common_tool_declarations() -> list[types.FunctionDeclaration]:
    """
    Tool declarations available in ALL modes regardless of category.
    Covers web search, fact memory, UI theming, cross-agent consultation,
    and interactive widget rendering.
    """
    return [
        types.FunctionDeclaration(
            name="search_web",
            description="Search the web for current information, facts, or context.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="The search query",
                    ),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="remember_fact",
            description="Save important facts about the user (e.g., name, preferences, project details) to long-term memory.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "fact": types.Schema(
                        type=types.Type.STRING,
                        description="A concise statement of the fact to remember",
                    ),
                },
                required=["fact"],
            ),
        ),
        types.FunctionDeclaration(
            name="change_ui_theme",
            description="Change the frontend user interface theme based on the current context, mood, or environment.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "theme": types.Schema(
                        type=types.Type.STRING,
                        description="The theme to apply: 'dark', 'light', 'midnight', 'sunset', 'ocean', 'forest', 'neon', 'rose'",
                    ),
                },
                required=["theme"],
            ),
        ),
        types.FunctionDeclaration(
            name="consult_agent",
            description="Consult another specialized AI agent for help (e.g., ask the 'code' agent for programming help or 'research' agent for deep analysis).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "specialty": types.Schema(
                        type=types.Type.STRING,
                        description="The agent to consult: 'code', 'research', 'navigator', 'creative', 'security'",
                    ),
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="Your specific question or task for this agent",
                    ),
                },
                required=["specialty", "query"],
            ),
        ),
        types.FunctionDeclaration(
            name="render_widget",
            description="Instantly render an interactive React UI widget on the user's screen (e.g., a timer, poll, or chart).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "widget_type": types.Schema(
                        type=types.Type.STRING,
                        description="The type of widget to render: 'timer', 'poll', 'chart', or 'weather'",
                    ),
                    "data": types.Schema(
                        type=types.Type.STRING,
                        description="JSON string containing the widget configuration (e.g. {'minutes': 5} for timer, {'question': '...', 'options': ['A', 'B', 'C']} for poll)",
                    ),
                },
                required=["widget_type", "data"],
            ),
        ),
    ]


def build_creative_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations specific to Creative-family modes (creative, music, game)."""
    return [
        types.FunctionDeclaration(
            name="generate_image",
            description="Generate an image based on a text description. Use this to create inline illustrations, diagrams, or visuals.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "prompt": types.Schema(
                        type=types.Type.STRING,
                        description="Detailed description of the image to generate",
                    ),
                    "style": types.Schema(
                        type=types.Type.STRING,
                        description="Art style: photorealistic, illustration, cartoon, sketch, watercolor",
                    ),
                },
                required=["prompt"],
            ),
        ),
        types.FunctionDeclaration(
            name="generate_story",
            description="Generate a multi-scene story with interleaved text and images. Perfect for creative storytelling with illustrations.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "prompt": types.Schema(
                        type=types.Type.STRING,
                        description="The story premise or topic",
                    ),
                    "style": types.Schema(
                        type=types.Type.STRING,
                        description="Visual style for illustrations: cinematic, watercolor, anime, photorealistic",
                    ),
                    "num_scenes": types.Schema(
                        type=types.Type.INTEGER,
                        description="Number of scenes/chapters (1-5)",
                    ),
                },
                required=["prompt"],
            ),
        ),
        types.FunctionDeclaration(
            name="propose_story_choices",
            description="Pause the story and give the user two interactive branching choices rendered as big UI buttons.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "choice_a": types.Schema(
                        type=types.Type.STRING,
                        description="The first choice (e.g. 'Open the dark door')",
                    ),
                    "choice_b": types.Schema(
                        type=types.Type.STRING,
                        description="The second choice (e.g. 'Run away')",
                    ),
                },
                required=["choice_a", "choice_b"],
            ),
        ),
    ]


def build_navigator_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations for Navigator-family modes (navigator, security)."""
    return [
        types.FunctionDeclaration(
            name="navigate",
            description="Navigate the browser to a URL. Always call this first before interacting with any page.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "url": types.Schema(
                        type=types.Type.STRING,
                        description="The URL to visit (e.g. google.com)",
                    ),
                },
                required=["url"],
            ),
        ),
        types.FunctionDeclaration(
            name="capture_screenshot",
            description="Capture a screenshot of the current browser page for analysis.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            ),
        ),
        types.FunctionDeclaration(
            name="click_element",
            description="Click on a UI element using a CSS selector (preferred) or x/y coordinates (fallback).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "selector": types.Schema(
                        type=types.Type.STRING,
                        description="CSS selector of the element to click (preferred)",
                    ),
                    "x": types.Schema(
                        type=types.Type.INTEGER,
                        description="X coordinate fallback (pixels from left)",
                    ),
                    "y": types.Schema(
                        type=types.Type.INTEGER,
                        description="Y coordinate fallback (pixels from top)",
                    ),
                    "description": types.Schema(
                        type=types.Type.STRING,
                        description="What you are clicking and why",
                    ),
                },
            ),
        ),
        types.FunctionDeclaration(
            name="type_text",
            description="Type text into an input field identified by CSS selector.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "selector": types.Schema(
                        type=types.Type.STRING,
                        description="CSS selector of the input field",
                    ),
                    "text": types.Schema(
                        type=types.Type.STRING,
                        description="The text to type",
                    ),
                },
                required=["selector", "text"],
            ),
        ),
        types.FunctionDeclaration(
            name="scroll_page",
            description="Scroll the browser page up or down.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "direction": types.Schema(
                        type=types.Type.STRING,
                        description="Direction: up or down",
                    ),
                    "amount": types.Schema(
                        type=types.Type.INTEGER,
                        description="Pixels to scroll (default 400)",
                    ),
                },
                required=["direction"],
            ),
        ),
    ]


def build_code_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations for Code Copilot mode."""
    return [
        types.FunctionDeclaration(
            name="read_directory",
            description="List the contents of a directory in the workspace to understand the project structure.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "path": types.Schema(
                        type=types.Type.STRING,
                        description="Relative or absolute path to the directory to list (e.g. '.')",
                    ),
                },
                required=["path"],
            ),
        ),
        types.FunctionDeclaration(
            name="read_file",
            description="Read the contents of a specific file in the workspace to analyze the source code.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "file_path": types.Schema(
                        type=types.Type.STRING,
                        description="Relative or absolute path to the file to read (e.g. 'src/app/page.tsx')",
                    ),
                },
                required=["file_path"],
            ),
        ),
    ]


def get_tools_for_mode(mode: str) -> list[types.Tool]:
    """
    Assemble the full tool list for a given mode.
    Common tools are always included; mode-specific tools are
    appended based on the base mode family.
    """
    base = MODE_TO_BASE.get(mode, "live")

    tools: list[types.Tool] = [
        types.Tool(google_search=types.GoogleSearch()),
        types.Tool(function_declarations=build_common_tool_declarations()),
    ]

    if base == "creative":
        tools.append(types.Tool(function_declarations=build_creative_tool_declarations()))

    if base == "navigator":
        tools.append(types.Tool(function_declarations=build_navigator_tool_declarations()))

    if base == "code":
        tools.append(types.Tool(function_declarations=build_code_tool_declarations()))

    return tools
