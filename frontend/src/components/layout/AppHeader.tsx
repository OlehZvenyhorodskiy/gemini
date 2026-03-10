"use client";

import type { AgentMode, AgentState, UseThemeReturn } from "@/hooks";
import { MODE_INFO } from "@/lib/constants";
import { ThemePicker } from "@/components/ui/ThemePicker";

/**
 * AppHeader — the top bar that sits above the main content
 * when the user has dismissed the landing page.
 *
 * Shows the logo, agent state indicator, theme picker,
 * session timer, connect/disconnect controls, and mic buttons.
 */
interface AppHeaderProps {
    isConnected: boolean;
    agentState: AgentState;
    sessionId: string;
    sessionElapsed: string;
    mode: AgentMode;
    isRecording: boolean;
    isHandsFree: boolean;
    themeHook: UseThemeReturn;
    onGoHome: () => void;
    onConnect: () => void;
    onToggleRecording: () => void;
    onToggleHandsFree: () => void;
    onOpenSettings: () => void;
    onShowGuide: () => void;
}

export function AppHeader({
    isConnected,
    agentState,
    sessionId,
    sessionElapsed,
    mode,
    isRecording,
    isHandsFree,
    themeHook,
    onGoHome,
    onConnect,
    onToggleRecording,
    onToggleHandsFree,
    onOpenSettings,
    onShowGuide,
}: AppHeaderProps) {
    return (
        <header className="header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="logo" onClick={onGoHome} style={{ cursor: "pointer" }} title="Return to Home">
                    <span className="logo-n">N</span>
                    <span className="logo-e">E</span>
                    <span className="logo-x">X</span>
                    <span className="logo-u">U</span>
                    <span className="logo-s">S</span>
                </div>
                {isConnected && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className={`status-dot ${agentState}`} />
                        <span className="status-label">{agentState}</span>
                    </div>
                )}
            </div>

            <div className="header-actions">
                {/* Manual Guide Trigger */}
                <button
                    onClick={onShowGuide}
                    className="theme-picker-btn"
                    title="Show Onboarding Guide"
                >
                    ❓ Guide
                </button>

                {/* Customisation Picker */}
                <ThemePicker
                    theme={themeHook.theme}
                    customColors={themeHook.customColors}
                    setCustomColors={themeHook.setCustomColors}
                    buttonStyle={themeHook.buttonStyle}
                    switchTheme={themeHook.switchTheme}
                    applyCustomColors={themeHook.applyCustomColors}
                    toggleButtonStyle={themeHook.toggleButtonStyle}
                    isThemePickerOpen={themeHook.isThemePickerOpen}
                    setIsThemePickerOpen={themeHook.setIsThemePickerOpen}
                />

                {isConnected && sessionElapsed && (
                    <span className="session-timer">⏱ {sessionElapsed}</span>
                )}

                {!isConnected ? (
                    <button id="connect-btn" onClick={onConnect} className="btn btn-success">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        Connect
                    </button>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                            {sessionId && `Session: ${sessionId}`}
                        </span>
                        {/* Mic & Hands-Free controls */}
                        <div className="flex gap-2">
                            <button
                                className={`panel-action-btn ${isRecording ? "recording" : ""}`}
                                onClick={onToggleRecording}
                                title="Microphone (Push-to-Talk)"
                            >
                                🎙️
                            </button>
                            <button
                                className={`panel-action-btn ${isHandsFree ? "active" : ""}`}
                                onClick={onToggleHandsFree}
                                title="Hands-Free Mode (Continuous)"
                                style={{ backgroundColor: isHandsFree ? "var(--google-blue)" : undefined, color: isHandsFree ? "#fff" : undefined }}
                            >
                                🎧 {isHandsFree ? "Hands-Free ON" : ""}
                            </button>
                        </div>
                        <button
                            onClick={onOpenSettings}
                            className="btn-icon"
                            title="Settings"
                        >
                            ⚙️
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
