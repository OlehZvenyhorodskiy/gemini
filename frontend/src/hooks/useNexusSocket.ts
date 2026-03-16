"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/** Server → Client message shape */
export interface ServerMessage {
    type: "audio" | "text" | "image" | "status" | "tool_call" | "tool_result" | "error";
    content?: string;
    data?: string;
    mime?: string;
    state?: "listening" | "thinking" | "speaking" | "interrupted";
    session_id?: string;
    mode?: string;
    message?: string;
    name?: string;
    turn_id?: string;
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
}

/** Chat message model used across the UI */
export interface ChatMessage {
    id: string;
    role: "user" | "agent";
    type: "text" | "image" | "tool" | "error";
    content: string;
    imageData?: string;
    imageMime?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: Record<string, unknown>;
    timestamp: Date;
}

export type AgentMode =
    | "live" | "creative" | "navigator"
    | "code" | "research" | "language" | "data"
    | "music" | "game" | "meeting" | "security"
    | "fitness" | "travel" | "debate";

export type AgentState = "listening" | "thinking" | "speaking" | "interrupted" | "disconnected";

const getWsUrl = () => {
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

const WS_URL = getWsUrl();

export interface UseNexusSocketReturn {
    wsRef: React.MutableRefObject<WebSocket | null>;
    isConnected: boolean;
    sessionId: string;
    agentState: AgentState;
    setAgentState: React.Dispatch<React.SetStateAction<AgentState>>;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    textInput: string;
    setTextInput: React.Dispatch<React.SetStateAction<string>>;
    mode: AgentMode;
    setMode: React.Dispatch<React.SetStateAction<AgentMode>>;
    connectWebSocket: () => void;
    disconnectWebSocket: () => void;
    sendTextMessage: () => void;
    switchMode: (newMode: AgentMode) => void;
    sendInterrupt: () => void;
    addMessage: (
        role: "user" | "agent",
        type: ChatMessage["type"],
        content: string,
        imageData?: string,
        imageMime?: string,
        toolName?: string,
        toolArgs?: Record<string, unknown>,
    ) => void;
    addSystemMessage: (content: string) => void;
}

/**
 * useNexusSocket — owns the WebSocket lifecycle, message routing,
 * chat state, and helpers for sending text / switching modes.
 *
 * The `onServerMessage` callback is invoked for every parsed ServerMessage
 * so that the audio engine and other hooks can react without pulling
 * WebSocket code into themselves.
 */
export function useNexusSocket(
    onServerMessage: (msg: ServerMessage) => void,
    persona: string,
    flushAudio: () => void,
): UseNexusSocketReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [agentState, setAgentState] = useState<AgentState>("disconnected");
    const [mode, setMode] = useState<AgentMode>("live");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [textInput, setTextInput] = useState("");
    const [sessionId, setSessionId] = useState("");

    const wsRef = useRef<WebSocket | null>(null);
    const isIntentionalDisconnectRef = useRef(false);

    // Debounce rapid state flickers (listening → thinking → listening in <100ms)
    const agentStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const setDebouncedAgentState = useCallback((state: AgentState) => {
        if (agentStateTimerRef.current) clearTimeout(agentStateTimerRef.current);
        agentStateTimerRef.current = setTimeout(() => setAgentState(state), 50);
    }, []);

    // --- Message helpers ---
    const addMessage = useCallback(
        (
            role: "user" | "agent",
            type: ChatMessage["type"],
            content: string,
            imageData?: string,
            imageMime?: string,
            toolName?: string,
            toolArgs?: Record<string, unknown>,
        ) => {
            const newMsg: ChatMessage = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                role, type, content, imageData, imageMime, toolName, toolArgs,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, newMsg]);
        },
        [],
    );

    const addSystemMessage = useCallback(
        (content: string) => addMessage("agent", "text", content),
        [addMessage],
    );

    /**
     * Route incoming server messages to the right handler.
     * Audio and image payloads are forwarded to the audio engine
     * via the onServerMessage callback, while state, tool, and
     * error messages are processed here.
     */
    const handleServerMessage = useCallback((msg: ServerMessage) => {
        // Forward to the parent component (audio engine, etc.)
        onServerMessage(msg);

        switch (msg.type) {
            case "status":
                if (msg.state) setDebouncedAgentState(msg.state);
                if (msg.session_id) setSessionId(msg.session_id);
                if (msg.mode) setMode(msg.mode as AgentMode);

                if (msg.state === "listening" || msg.state === "interrupted") {
                    // Audio engine handles queue flushing via onServerMessage
                }

                // Backend-detected barge-in
                if (msg.state === "interrupted") {
                    flushAudio();
                }
                break;
            case "text": {
                const rawText = msg.content || "";
                let cleanText = rawText.replace(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]/g, "");
                
                // --- Strip thinking / reasoning text ---
                // Remove <think>...</think> blocks (may span multiple lines)
                cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, "");
                // Remove [Thinking] or [Internal] prefixed lines
                cleanText = cleanText.replace(/^\[(?:Thinking|Internal|Reasoning)\].*$/gim, "");
                // Remove **Thinking:** blocks (markdown bold headers used for reasoning)
                cleanText = cleanText.replace(/\*\*(?:Thinking|Internal Monologue|Reasoning):\*\*[\s\S]*?(?=\n\n|\n\*\*|$)/gi, "");
                // Clean up excess whitespace left after stripping
                cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();
                
                // If it was ONLY a bounding box or thinking (which are hidden), skip
                if (!cleanText.trim() && rawText.trim()) break;

                // When text arrives, the agent is definitely "speaking" (or responding)
                setDebouncedAgentState("speaking");

                setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    const turnId = msg.turn_id || `turn-${Date.now()}`;

                    // Merge only when this chunk clearly belongs to the same logical turn.
                    // We now require an explicit, matching turn_id so that multiple
                    // back‑to‑back agent messages show up as separate bubbles instead
                    // of being "stacked" into one.
                    const shouldMerge =
                        !!msg.turn_id &&
                        lastMsg &&
                        lastMsg.role === "agent" &&
                        lastMsg.type === "text" &&
                        lastMsg.id === msg.turn_id;

                    if (shouldMerge) {
                        updated[updated.length - 1] = {
                            ...lastMsg,
                            content: lastMsg.content + cleanText,
                        };
                        return updated;
                    }

                    return [
                        ...updated,
                        {
                            id: turnId,
                            role: "agent",
                            type: "text",
                            content: cleanText,
                            timestamp: new Date(),
                        },
                    ];
                });
                break;
            }
            case "tool_call":
                addMessage("agent", "tool", `Using tool: ${msg.name}`, undefined, undefined, msg.name, msg.args);
                break;
            case "tool_result":
                setMessages((prev) => {
                    const updated = [...prev];
                    const lastToolIdx = updated.findLastIndex((m) => m.type === "tool");
                    if (lastToolIdx >= 0) {
                        updated[lastToolIdx] = { ...updated[lastToolIdx], toolResult: msg.result };
                    }
                    return updated;
                });
                break;
            case "error":
                addMessage("agent", "error", msg.message || "Unknown error");
                if (msg.message?.includes("PERMISSION_DENIED") || msg.message?.includes("leaked") || msg.message?.includes("API key not valid")) {
                    addSystemMessage("🛑 Fatal Auth Error: Connection halted. Please update your GOOGLE_API_KEY in the backend .env file and restart the server.");
                    reconnectAttemptRef.current = 999; // Prevent rapid retries
                    if (wsRef.current) wsRef.current.close();
                }
                break;
        }
    }, [onServerMessage, setDebouncedAgentState, addMessage, flushAudio]);
    const reconnectAttemptRef = useRef(0);

    /**
     * Establish a WebSocket connection to the NEXUS backend.
     * Persists a user_id in localStorage for cross-session identity.
     * Uses exponential backoff for reconnection (3s → 6s → 12s → max 30s).
     */
    const connectWebSocket = useCallback(() => {
        // Clean up any existing connection first
        if (wsRef.current) {
            if (wsRef.current.readyState === WebSocket.OPEN) return;
            // Remove event handlers to prevent ghost reconnects
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.onmessage = null;
            if (wsRef.current.readyState === WebSocket.CONNECTING) {
                wsRef.current.close();
            }
        }

        let userId = localStorage.getItem("nexus_user_id");
        if (!userId) {
            userId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
            localStorage.setItem("nexus_user_id", userId);
        }

        const urlWithUser = `${WS_URL}?user_id=${userId}`;
        const ws = new WebSocket(urlWithUser);
        wsRef.current = ws;

        ws.onopen = () => {
            isIntentionalDisconnectRef.current = false;
            reconnectAttemptRef.current = 0; // Reset backoff on success
            setIsConnected(true);
            setAgentState("listening");
            addSystemMessage("Connected to NEXUS. Ready to go.");

            ws.send(JSON.stringify({
                type: "config",
                settings: { persona },
            }));
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const msg: ServerMessage = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (err) {
                console.error("Failed to parse server message:", err);
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            setAgentState("disconnected");
            
            if (isIntentionalDisconnectRef.current) return;
            
            // Exponential backoff: 3s, 6s, 12s, 24s, capped at 30s
            const attempt = reconnectAttemptRef.current;
            const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
            reconnectAttemptRef.current = attempt + 1;
            
            addSystemMessage(`Connection lost. Retrying in ${Math.round(delay / 1000)}s...`);
            setTimeout(() => connectWebSocket(), delay);
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persona]);

    const sendTextMessage = useCallback(() => {
        const trimmed = textInput.trim();
        if (!trimmed || !wsRef.current) return;
        addMessage("user", "text", trimmed);
        wsRef.current.send(JSON.stringify({ type: "text", content: trimmed }));
        setTextInput("");
    }, [textInput, addMessage]);

    const switchMode = useCallback((newMode: AgentMode) => {
        setMode(newMode);
        setMessages([]);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "mode", mode: newMode }));
        }
    }, []);

    const disconnectWebSocket = useCallback(() => {
        isIntentionalDisconnectRef.current = true;
        if (wsRef.current) {
            wsRef.current.close();
        }
    }, []);

    /**
     * Interrupt the agent — flushes audio instantly and tells the
     * backend to stop generating.
     */
    const sendInterrupt = useCallback(() => {
        flushAudio();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "interrupt" }));
        }
    }, [flushAudio]);

    // Re-sync persona config whenever it changes
    useEffect(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "config",
                settings: { persona },
            }));
        }
    }, [persona]);

    return {
        wsRef,
        isConnected,
        sessionId,
        agentState,
        setAgentState,
        messages,
        setMessages,
        textInput,
        setTextInput,
        mode,
        setMode,
        connectWebSocket,
        disconnectWebSocket,
        sendTextMessage,
        switchMode,
        sendInterrupt,
        addMessage,
        addSystemMessage,
    };
}
