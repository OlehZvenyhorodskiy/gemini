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
export const getWsUrl = () => {
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    if (typeof window !== "undefined") {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        if (window.location.hostname === "localhost" && window.location.port === "3000") {
            return "ws://localhost:8080/ws";
        }
        return `${protocol}//${window.location.host}/ws`;
    }
    return "ws://localhost:8080/ws";
};

export const WS_URL = getWsUrl();

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

export interface ModeSuggestion {
    icon: string;
    label: string;
    prompt: string;
}

export const MODE_SUGGESTIONS: Partial<Record<AgentMode, ModeSuggestion[]>> = {
    live: [
        { icon: "🌤️", label: "Check Weather", prompt: "What's the weather looking like today?" },
        { icon: "💡", label: "Brainstorm Ideas", prompt: "Help me brainstorm startup ideas" },
        { icon: "⚛️", label: "Explain Concepts", prompt: "Explain quantum computing simply" },
        { icon: "👁️", label: "Analyze Camera", prompt: "What can you see through my camera?" }
    ],
    creative: [
        { icon: "📚", label: "Sci-Fi Story", prompt: "Write a sci-fi short story with images" },
        { icon: "🎨", label: "Marketing Campaign", prompt: "Create a marketing campaign for a coffee brand" },
        { icon: "😸", label: "Children's Book", prompt: "Generate a children's book about a space cat" },
        { icon: "🎬", label: "Movie Poster", prompt: "Design a movie poster concept" }
    ],
    navigator: [
        { icon: "🧭", label: "Navigate Site", prompt: "Help me navigate this website" },
        { icon: "🖱️", label: "Find Button", prompt: "Find and click the settings button" },
        { icon: "📋", label: "Auto Fill Form", prompt: "Fill out this form for me" },
        { icon: "📸", label: "Analyze Screen", prompt: "Take a screenshot and analyze it" }
    ],
    code: [
        { icon: "📂", label: "Read structure", prompt: "Explain the project structure and list top level files" },
        { icon: "🔍", label: "Analyze local code", prompt: "List files in the current directory and explain what they do" },
        { icon: "🐍", label: "Write Python Logic", prompt: "Write a high-performance Python script that calculates prime numbers" },
        { icon: "⚡", label: "Hello World", prompt: "Please write a Hello World program in Python. Provide only the code snippet so I can run it." }
    ],
    research: [
        { icon: "🤖", label: "Latest AI Models", prompt: "Research the latest AI model releases" },
        { icon: "⚖️", label: "Compare Frameworks", prompt: "Compare React vs Vue for my project" },
        { icon: "🔋", label: "Renewable Tech", prompt: "Find papers on renewable energy tech" },
        { icon: "📐", label: "API Best Practices", prompt: "What are the best practices for API design?" }
    ],
    language: [
        { icon: "🍣", label: "Order in Japanese", prompt: "Teach me how to order food in Japanese" },
        { icon: "🥐", label: "French Practice", prompt: "Practice a French conversation with me" },
        { icon: "🌐", label: "Say Thank You", prompt: "How do you say 'thank you' in 10 languages?" },
        { icon: "🗣️", label: "Correct Spanish", prompt: "Correct my Spanish pronunciation" }
    ],
    data: [
        { icon: "📈", label: "Analyze Trend", prompt: "Analyze the trend in this chart" },
        { icon: "🥧", label: "Chart Insights", prompt: "What does this pie chart tell us?" },
        { icon: "📊", label: "Summarize Metrics", prompt: "Summarize the key metrics from this spreadsheet" },
        { icon: "🚨", label: "Find Anomalies", prompt: "Find anomalies in my sales data" }
    ],
    music: [
        { icon: "🎹", label: "Chord Progression", prompt: "Explain the chord progression of Bohemian Rhapsody" },
        { icon: "🎧", label: "Lo-fi Lyrics", prompt: "Write lyrics for a lo-fi hip hop track" },
        { icon: "🎼", label: "Identify Key", prompt: "What key is this melody in?" },
        { icon: "🎸", label: "Song Structure", prompt: "Design a song structure for a rock ballad" }
    ],
    game: [
        { icon: "🐉", label: "Start RPG", prompt: "Start a fantasy RPG adventure" },
        { icon: "🏰", label: "Enter Dungeon", prompt: "I enter the ancient dungeon" },
        { icon: "🌆", label: "Cyberpunk Mystery", prompt: "Create a cyberpunk mystery scenario" },
        { icon: "🗣️", label: "Negotiate", prompt: "I want to negotiate with the dragon" }
    ],
    meeting: [
        { icon: "📝", label: "Action Items", prompt: "Summarize the key action items" },
        { icon: "👥", label: "Responsibilities", prompt: "Who is responsible for what?" },
        { icon: "✅", label: "Decisions Made", prompt: "What decisions were made?" },
        { icon: "⏰", label: "List Deadlines", prompt: "List all deadlines mentioned" }
    ],
    security: [
        { icon: "🛡️", label: "Scan Page", prompt: "Scan this page for vulnerabilities" },
        { icon: "🔗", label: "Check URL", prompt: "Is this URL suspicious?" },
        { icon: "🔑", label: "Exposed Keys", prompt: "Check for exposed API keys in this code" },
        { icon: "🔓", label: "Analyze Login", prompt: "Analyze this login form for security flaws" }
    ],
    fitness: [
        { icon: "🏋️", label: "4-Day Split", prompt: "Design a 4-day upper/lower split for me" },
        { icon: "🎥", label: "Check Squat Form", prompt: "Check my squat form via camera" },
        { icon: "🍗", label: "Post-Workout Food", prompt: "What should I eat post-workout?" },
        { icon: "⏱️", label: "HIIT Routine", prompt: "Build me a 20-minute HIIT routine" }
    ],
    travel: [
        { icon: "🗼", label: "Tokyo Trip", prompt: "Plan a 5-day trip to Tokyo on a mid-range budget" },
        { icon: "🐪", label: "Morocco Tips", prompt: "What do I need to know before visiting Morocco?" },
        { icon: "✈️", label: "Barcelona Flights", prompt: "Find the best flights to Barcelona next month" },
        { icon: "🧊", label: "Visit Iceland", prompt: "What's the best time to visit Iceland?" }
    ],
    debate: [
        { icon: "🤖", label: "AI & Jobs", prompt: "Let's debate whether AI will replace most jobs" },
        { icon: "💰", label: "Universal Income", prompt: "Argue for universal basic income — I'll argue against" },
        { icon: "📱", label: "Social Media", prompt: "Is social media a net positive for society?" },
        { icon: "🎓", label: "Free College", prompt: "Should college education be free?" }
    ],
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
