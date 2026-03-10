"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentMode, AgentState, ChatMessage } from "@/hooks";
import { MODE_INFO, ALL_MODES, MODE_SUGGESTIONS } from "@/lib/constants";
import { MessageNode } from "@/components/chat/MessageNode";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { AudioVisualizer } from "@/components/visualizer/AudioVisualizer";

/**
 * ChatWorkspace — the main connected-state UI containing the
 * mode tab strip, spatial canvas with message nodes, collaborative
 * canvas panel, audio visualizer, and input bar.
 *
 * Now includes:
 * - framer-motion AnimatePresence for smooth mode transitions
 * - Premium AudioVisualizer instead of basic canvas drawbar
 * - layoutId underline on the active mode tab
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
    // Infinite Spatial Canvas drag state
    const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
    const isDraggingCanvasRef = useRef(false);
    const lastMousePosRef = useRef({ x: 0, y: 0 });

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.message-row') || (e.target as HTMLElement).closest('.welcome-section')) return;
        isDraggingCanvasRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDraggingCanvasRef.current) return;
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setCanvasPan(p => ({ x: p.x + dx, y: p.y + dy }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleCanvasMouseUp = useCallback(() => {
        isDraggingCanvasRef.current = false;
    }, []);

    return (
        <>
            {/* Mode tabs strip with animated underline */}
            <div style={{
                display: "flex",
                gap: "4px",
                padding: "8px 20px",
                overflowX: "auto",
                borderBottom: "1px solid var(--border-primary)",
                position: "relative",
            }}>
                {ALL_MODES.map((m) => (
                    <button
                        key={m}
                        onClick={() => onSwitchMode(m)}
                        className="btn btn-ghost"
                        style={{
                            borderRadius: "0",
                            padding: "6px 12px",
                            fontSize: "0.8125rem",
                            whiteSpace: "nowrap",
                            color: mode === m ? "var(--google-blue)" : "var(--text-secondary)",
                            fontWeight: mode === m ? 600 : 400,
                            position: "relative",
                            borderBottom: "2px solid transparent",
                        }}
                    >
                        {MODE_INFO[m].emoji} {MODE_INFO[m].label}
                        {/* Animated underline indicator — slides to the active tab */}
                        {mode === m && (
                            <motion.div
                                layoutId="mode-tab-indicator"
                                style={{
                                    position: "absolute",
                                    bottom: "-2px",
                                    left: 0,
                                    right: 0,
                                    height: "2px",
                                    background: "var(--google-blue)",
                                    borderRadius: "1px",
                                }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Workspace Layout (Chat + Canvas) */}
            <div className="workspace-layout animate-fade-in">
                {/* Chat area / Spatial Canvas */}
                <div
                    className="chat-area spatial-canvas-container"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    style={{ overflow: "hidden", position: "relative", cursor: isDraggingCanvasRef.current ? "grabbing" : "grab" }}
                >
                    <div
                        className="spatial-canvas-layer"
                        style={{
                            position: "absolute",
                            top: "10%",
                            left: "50%",
                            transform: `translate(calc(-50% + ${canvasPan.x}px), ${canvasPan.y}px)`,
                            width: 0,
                            height: 0,
                            transition: isDraggingCanvasRef.current ? "none" : "transform 0.1s ease-out"
                        }}
                    >
                        {/* AnimatePresence wraps content so mode switches get smooth transitions */}
                        <AnimatePresence mode="wait">
                            {messages.length === 0 ? (
                                /* Empty state with suggestions — animates in/out on mode switch */
                                <motion.div
                                    key={`welcome-${mode}`}
                                    variants={modeTransitionVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
                                    className="welcome-section"
                                    style={{ position: "absolute", transform: "translate(-50%, 0)", width: "600px" }}
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
                                                onClick={() => {
                                                    onSetTextInput(s);
                                                    addMessage("user", "text", s);
                                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                        wsRef.current.send(JSON.stringify({ type: "text", content: s }));
                                                    }
                                                }}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            ) : (
                                /* Spatial Message Nodes */
                                <motion.div
                                    key="messages"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.2 }}
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
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Thinking indicator */}
                        {agentState === "thinking" && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="message-row agent spatial-node pointer-events-none"
                                style={{
                                    position: "absolute",
                                    transform: `translate(calc(-50% - 250px), ${(messages.length) * 180}px)`,
                                    width: "120px",
                                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                                    borderRadius: "16px",
                                    padding: "16px",
                                    background: "var(--glass-bg)",
                                    backdropFilter: "blur(12px)",
                                    border: "1px solid var(--border-primary)"
                                }}
                            >
                                <div className="avatar agent-avatar mb-2">✦</div>
                                <div className="typing-indicator">
                                    <div className="typing-dot" />
                                    <div className="typing-dot" />
                                    <div className="typing-dot" />
                                </div>
                            </motion.div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Collaborative Canvas */}
                {["creative", "navigator", "code"].includes(mode) && messages.some(m => m.imageData || (m.toolResult as Record<string, unknown>)?.screenshot) && (
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
