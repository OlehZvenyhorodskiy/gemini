"use client";

import type { AgentMode, AgentState } from "@/hooks";
import { MODE_INFO } from "@/lib/constants";

/**
 * ChatInputBar — the bottom input area shown when connected.
 *
 * Contains the mic button, text input field, send button,
 * and camera/screen-share controls. Also shows an "Interrupt"
 * button when the agent is speaking.
 */
interface ChatInputBarProps {
    agentState: AgentState;
    mode: AgentMode;
    textInput: string;
    isConnected: boolean;
    isRecording: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    onTextChange: (val: string) => void;
    onSend: () => void;
    onInterrupt: () => void;
    onToggleRecording: () => void;
    onToggleCamera: () => void;
    onToggleScreenShare: () => void;
}

export function ChatInputBar({
    agentState,
    mode,
    textInput,
    isConnected,
    isRecording,
    isCameraOn,
    isScreenSharing,
    onTextChange,
    onSend,
    onInterrupt,
    onToggleRecording,
    onToggleCamera,
    onToggleScreenShare,
}: ChatInputBarProps) {
    if (agentState === "speaking") {
        return (
            <div className="input-area">
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <button onClick={onInterrupt} className="interrupt-btn">
                        ⏹ Interrupt
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="input-area">
            <div className="input-row">
                <button
                    onClick={onToggleRecording}
                    className={`media-btn mic-btn ${isRecording ? "recording" : ""}`}
                    title={isRecording ? "Stop recording" : "Start recording"}
                >
                    🎙️
                </button>

                <div className="text-input-wrapper">
                    <input
                        type="text"
                        value={textInput}
                        onChange={(e) => onTextChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSend()}
                        placeholder={`Message ${MODE_INFO[mode].label}...`}
                        disabled={!isConnected}
                    />
                </div>

                <button
                    onClick={onSend}
                    className="btn-send"
                    disabled={!textInput.trim() || !isConnected}
                    title="Send message"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </div>

            <div className="media-controls">
                <button
                    onClick={onToggleCamera}
                    className={`media-btn ${isCameraOn ? "active" : ""}`}
                    title={isCameraOn ? "Stop camera" : "Start camera"}
                >
                    📷
                </button>
                <button
                    onClick={onToggleScreenShare}
                    className={`media-btn ${isScreenSharing ? "active" : ""}`}
                    title={isScreenSharing ? "Stop sharing" : "Share screen"}
                >
                    🖥️
                </button>
            </div>
        </div>
    );
}
