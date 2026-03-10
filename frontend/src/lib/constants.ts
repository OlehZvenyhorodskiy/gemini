/**
 * Shared constants, types, and metadata used across
 * multiple NEXUS frontend components.
 *
 * Pulled out of page.tsx so that LandingPage, ModeHub,
 * AppHeader, ChatWorkspace, etc. can all import these
 * without circular dependencies or duplication.
 */

import type { AgentMode } from "@/hooks";

// ─── WebSocket URL ─────────────────────────────────────────────
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";

// ─── Mode Metadata ─────────────────────────────────────────────
export interface ModeInfo {
    label: string;
    emoji: string;
    description: string;
    accent: string;
}

export const MODE_INFO: Record<AgentMode, ModeInfo> = {
    live: { label: "Live Agent", emoji: "🗣️", description: "Engage in fluid, real-time voice and vision conversations with an agent that acts as your personal companion.", accent: "#4285F4" },
    creative: { label: "Creative Studio", emoji: "✍️", description: "Brainstorm ideas, generate compelling stories, synthesize images, and create rich mixed media content effortlessly.", accent: "#EA4335" },
    navigator: { label: "UI Navigator", emoji: "☸️", description: "Your digital copilot. It perceives your screen content and helps you navigate complex websites and applications autonomously.", accent: "#34A853" },
    code: { label: "Code Copilot", emoji: "💻", description: "Pair-program in real-time. Debug complex errors, review software architecture, and write production-ready code instantly.", accent: "#4285F4" },
    research: { label: "Research Assistant", emoji: "🔬", description: "Conduct deep-dive research with live web-search capabilities to synthesize and summarize complex topics accurately.", accent: "#FBBC05" },
    language: { label: "Language Tutor", emoji: "🌍", description: "Practice conversational speaking and writing in any language with live grammatical corrections and cultural context.", accent: "#34A853" },
    data: { label: "Data Analyst", emoji: "📊", description: "Upload spreadsheets or charts, and instantly analyze trends, extract actionable insights, and format raw data.", accent: "#4285F4" },
    music: { label: "Music Lab", emoji: "🎵", description: "Explore music theory, compose original lyrics, and understand complex chord progressions dynamically.", accent: "#EA4335" },
    game: { label: "Game Master", emoji: "🎮", description: "Step into immersive roleplay. The agent acts as a dynamic Dungeon Master for interactive, never-ending story games.", accent: "#FBBC05" },
    meeting: { label: "Meeting Notes", emoji: "📝", description: "Automatically transcribe audio, summarize key talking points, and extract actionable tasks from your live meetings.", accent: "#34A853" },
    security: { label: "Security Scanner", emoji: "🛡️", description: "Analyze UI frameworks and backend code for potential OWASP top 10 vulnerabilities and security loopholes.", accent: "#EA4335" },
    fitness: { label: "Fitness Coach", emoji: "💪", description: "Get personalized workout plans, real-time form checks via camera, nutrition guidance, and recovery protocols.", accent: "#34A853" },
    travel: { label: "Travel Planner", emoji: "✈️", description: "Plan trips with day-by-day itineraries, budget estimates, cultural briefings, and real-time travel info.", accent: "#FBBC05" },
    debate: { label: "Debate Partner", emoji: "⚔️", description: "Sharpen your critical thinking with a Socratic sparring partner who steel-mans opposing arguments.", accent: "#EA4335" },
};

export const ALL_MODES = Object.keys(MODE_INFO) as AgentMode[];

export const MODE_SUGGESTIONS: Partial<Record<AgentMode, string[]>> = {
    live: ["What's the weather looking like today?", "Help me brainstorm startup ideas", "Explain quantum computing simply", "What can you see through my camera?"],
    creative: ["Write a sci-fi short story with images", "Create a marketing campaign for a coffee brand", "Generate a children's book about a space cat", "Design a movie poster concept"],
    navigator: ["Help me navigate this website", "Find and click the settings button", "Fill out this form for me", "Take a screenshot and analyze it"],
    code: ["Review this function for bugs", "Refactor this code to be cleaner", "Help me debug this error message", "Explain how this algorithm works"],
    research: ["Research the latest AI model releases", "Compare React vs Vue for my project", "Find papers on renewable energy tech", "What are the best practices for API design?"],
    fitness: ["Design a 4-day upper/lower split for me", "Check my squat form via camera", "What should I eat post-workout?", "Build me a 20-minute HIIT routine"],
    travel: ["Plan a 5-day trip to Tokyo on a mid-range budget", "What do I need to know before visiting Morocco?", "Find the best flights to Barcelona next month", "What's the best time to visit Iceland?"],
    debate: ["Let's debate whether AI will replace most jobs", "Argue for universal basic income — I'll argue against", "Is social media a net positive for society?", "Should college education be free?"],
};

// ─── Custom Agent Type ─────────────────────────────────────────
/** User-defined custom agent stored in localStorage */
export interface CustomAgent {
    id: string;
    name: string;
    emoji: string;
    description: string;
    systemPrompt: string;
}
