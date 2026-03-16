"use client";

import { useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentMode, AgentState, ChatMessage } from "@/hooks";
import { MODE_INFO, ALL_MODES, MODE_SUGGESTIONS } from "@/lib/constants";
import { MessageNode } from "@/components/chat/MessageNode";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { AudioVisualizer } from "@/components/visualizer/AudioVisualizer";
import { ThinkingIndicator, ConnectionBanner } from "@/components/ui/StatusIndicators";
import { CodeAssistantPanel } from "@/components/chat/CodeAssistantPanel";

/**
 * ChatWorkspace — the main connected-state UI containing the
 * mode tab strip, scrollable chat messages, code assistant panel,
 * audio visualizer, and input bar.
 *
 * v2: Replaced spatial canvas layout with standard scrollable flex-column
 * to fix message overlapping and enable proper scroll.
 */
interface ChatWorkspaceProps {
    mode: AgentMode;
    agentState: AgentState;
    messages: ChatMessage[];
    textInput: string;
    isConnected: boolean;
    isRecording: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    wsRef: React.MutableRefObject<WebSocket | null>;
    /** AnalyserNode from the output (agent) audio pipeline */
    outputAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
    /** AnalyserNode from the mic input pipeline */
    micAnalyserRef?: React.MutableRefObject<AnalyserNode | null>;
    onSwitchMode: (m: AgentMode) => void;
    onSetTextInput: (val: string) => void;
    onSendText: () => void;
    onInterrupt: () => void;
    onToggleRecording: () => void;
    onToggleCamera: () => void;
    onToggleScreenShare: () => void;
    addMessage: (
        role: "user" | "agent",
        type: ChatMessage["type"],
        content: string,
        imageData?: string,
        imageMime?: string,
        toolName?: string,
        toolArgs?: Record<string, unknown>,
    ) => void;
}

// Framer-motion variants for mode transition animations
const modeTransitionVariants = {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.98 },
};

export function ChatWorkspace({
    mode,
    agentState,
    messages,
    textInput,
    isConnected,
    isRecording,
    isCameraOn,
    isScreenSharing,
    canvasRef,
    messagesEndRef,
    wsRef,
    outputAnalyserRef,
    micAnalyserRef,
    onSwitchMode,
    onSetTextInput,
    onSendText,
    onInterrupt,
    onToggleRecording,
    onToggleCamera,
    onToggleScreenShare,
    addMessage,
}: ChatWorkspaceProps) {
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the bottom when new messages arrive
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
    }, [messages.length]);

    const handleSuggestionClick = useCallback((s: string) => {
        onSetTextInput(s);
        addMessage("user", "text", s);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "text", content: s }));
        }
    }, [onSetTextInput, addMessage, wsRef]);

    return (
        <>
            <ConnectionBanner isConnected={isConnected} agentState={agentState} />

            {/* Mode tabs strip with animated underline */}
            <div
                role="tablist"
                aria-label="Agent Modes"
                className="mode-tab-strip"
            >
                {ALL_MODES.map((m) => (
                    <button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        aria-controls={`workspace-${m}`}
                        onClick={() => onSwitchMode(m)}
                        className={`mode-tab ${mode === m ? 'active' : ''}`}
                    >
                        {MODE_INFO[m].emoji} {MODE_INFO[m].label}
                        {/* Animated underline indicator — slides to the active tab */}
                        {mode === m && (
                            <motion.div
                                layoutId="mode-tab-indicator"
                                className="mode-tab-underline"
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Main Workspace Area — switches context based on mode */}
            <motion.div
                key={mode}
                variants={modeTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="workspace-layout"
                role="tabpanel"
                id={`workspace-${mode}`}
                aria-label={`${MODE_INFO[mode].label} Workspace`}
            >
                <div className="workspace-flex-row">
                    {/* Chat area — scrollable flex-column */}
                    <div
                        className="chat-area"
                        ref={chatScrollRef}
                        role="region"
                        aria-label="Chat Messages"
                    >
                        <AnimatePresence mode="wait">
                            {messages.length === 0 ? (
                                /* Empty state with suggestions */
                                <motion.div
                                    key={`welcome-${mode}`}
                                    variants={modeTransitionVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
                                    className="welcome-section"
                                >
                                    <div className="hero-ring">
                                        {MODE_INFO[mode].emoji}
                                    </div>
                                    <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                                        {MODE_INFO[mode].label}
                                    </h2>
                                    <p className="welcome-subtitle">
                                        {MODE_INFO[mode].description}
                                    </p>
                                    <div className="suggestion-grid">
                                        {(MODE_SUGGESTIONS[mode] || MODE_SUGGESTIONS.live || []).map((s, i) => (
                                            <button
                                                key={i}
                                                className="suggestion-chip"
                                                onClick={() => handleSuggestionClick(s)}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="messages"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.2 }}
                                    role="log"
                                    className="messages-container"
                                >
                                    {messages.map((msg, index) => (
                                        <MessageNode
                                            key={msg.id}
                                            msg={msg}
                                            index={index}
                                            messages={messages}
                                            mode={mode}
                                            onSendText={(text) => {
                                                addMessage("user", "text", text);
                                                if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                    wsRef.current.send(JSON.stringify({ type: "text", content: text }));
                                                }
                                            }}
                                            wsRef={wsRef}
                                            addMessage={addMessage}
                                        />
                                    ))}

                                    {/* Thinking indicator at the end of the list */}
                                    <AnimatePresence>
                                        {agentState === "thinking" && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="message-wrapper justify-start"
                                            >
                                                <div className="message-row agent thinking-indicator-row">
                                                    <ThinkingIndicator label="Agent is thinking..." />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div ref={(el) => { if (messagesEndRef) (messagesEndRef as React.MutableRefObject<HTMLDivElement | null>).current = el; bottomRef.current = el; }} style={{ height: 1 }} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Code Assistant Dedicated Window */}
                    <AnimatePresence>
                        {mode === "code" && (
                            <CodeAssistantPanel
                                mode={mode}
                                messages={messages}
                                wsRef={wsRef}
                                addMessage={addMessage}
                            />
                        )}
                    </AnimatePresence>

                    {/* Collaborative Canvas (Legacy/Visual modes) */}
                    {["creative", "navigator"].includes(mode) && messages.some(m => m.imageData || (m.toolResult as Record<string, unknown>)?.screenshot) && (
                        <div className="collaborative-canvas">
                            <div className="canvas-header">
                                <span className="canvas-title">Workspace Canvas</span>
                                <div className="canvas-subtitle">Generated media & artifacts</div>
                            </div>
                            <div className="canvas-content">
                                {(() => {
                                    const latestArt = [...messages].reverse().find(m => m.imageData || (m.toolResult as Record<string, unknown>)?.screenshot);
                                    if (latestArt?.imageData) {
                                        return (
                                            <div className="canvas-media-wrapper">
                                                <img src={`data:${latestArt.imageMime || "image/png"};base64,${latestArt.imageData}`} alt="Generated" className="canvas-image" />
                                            </div>
                                        );
                                    }
                                    if ((latestArt?.toolResult as Record<string, unknown>)?.screenshot) {
                                        return (
                                            <div className="canvas-media-wrapper screenshot-wrapper">
                                                <img src={`data:image/jpeg;base64,${(latestArt!.toolResult as Record<string, unknown>).screenshot}`} alt="Screenshot" className="canvas-image screenshot-img" />
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Premium Audio Visualizer — always visible when connected, reacts to agent state */}
            <AudioVisualizer
                analyserRef={outputAnalyserRef}
                micAnalyserRef={micAnalyserRef}
                agentState={agentState}
                mode={mode}
                isRecording={isRecording}
            />

            {/* Input area */}
            <ChatInputBar
                agentState={agentState}
                mode={mode}
                textInput={textInput}
                isConnected={isConnected}
                isRecording={isRecording}
                isCameraOn={isCameraOn}
                isScreenSharing={isScreenSharing}
                onTextChange={onSetTextInput}
                onSend={onSendText}
                onInterrupt={onInterrupt}
                onToggleRecording={onToggleRecording}
                onToggleCamera={onToggleCamera}
                onToggleScreenShare={onToggleScreenShare}
            />
        </>
    );
}
