"use client";

import type { AgentMode } from "@/hooks";
import { MODE_INFO, WS_URL, type CustomAgent } from "@/lib/constants";

/**
 * SettingsModal — overlay panel with session info,
 * persona tuning, persistent memory center, and past sessions.
 */
interface SettingsModalProps {
    sessionId: string;
    mode: AgentMode;
    isConnected: boolean;
    theme: string;
    persona: string;
    userFacts: string;
    pastSessions: Array<{ id: string; created_at: string }>;
    isLoadingHistory: boolean;
    onClose: () => void;
    onPersonaChange: (val: string) => void;
    onLoadHistory: (sid: string) => void;
}

export function SettingsModal({
    sessionId,
    mode,
    isConnected,
    theme,
    persona,
    userFacts,
    pastSessions,
    isLoadingHistory,
    onClose,
    onPersonaChange,
    onLoadHistory,
}: SettingsModalProps) {
    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
                <h2>Settings</h2>
                <div className="setting-row">
                    <span className="setting-label">Session ID</span>
                    <span className="setting-value">{sessionId || "—"}</span>
                </div>
                <div className="setting-row">
                    <span className="setting-label">Current Mode</span>
                    <span className="setting-value">{MODE_INFO[mode].label}</span>
                </div>
                <div className="setting-row">
                    <span className="setting-label">Connection</span>
                    <span className="setting-value">{isConnected ? "Active" : "Disconnected"}</span>
                </div>
                <div className="setting-row">
                    <span className="setting-label">Theme</span>
                    <span className="setting-value" style={{ textTransform: "capitalize" }}>{theme}</span>
                </div>
                <div className="setting-row">
                    <span className="setting-label">WebSocket URL</span>
                    <span className="setting-value" style={{ fontSize: "0.6875rem" }}>{WS_URL}</span>
                </div>
                <div className="setting-row" style={{ marginTop: "1rem" }}>
                    <span className="setting-label">Persona Tuning</span>
                    <select
                        className="form-input"
                        style={{ width: "130px", padding: "4px 8px", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: "6px" }}
                        value={persona}
                        onChange={(e) => onPersonaChange(e.target.value)}
                    >
                        <option value="default">Default</option>
                        <option value="professional">Professional</option>
                        <option value="sarcastic">Sarcastic</option>
                        <option value="empathetic">Empathetic</option>
                        <option value="genz">Gen Z / Slang</option>
                        <option value="pirate">Pirate</option>
                        <option value="poet">Lyrical Poet</option>
                    </select>
                </div>

                {/* Brain (Memory) Section */}
                <div style={{ marginTop: "1.5rem", padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "12px", border: "1px solid var(--border-primary)" }}>
                    <h3 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "1rem", color: "var(--google-blue)" }}>
                        🧠 Persistent Memory Center
                    </h3>
                    <div style={{ maxHeight: "150px", overflowY: "auto", fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", background: "var(--bg-primary)", padding: "12px", borderRadius: "8px", border: "1px inset var(--border-primary)", marginBottom: "16px" }}>
                        {userFacts ? userFacts : <span style={{ fontStyle: "italic", opacity: 0.6 }}>The agent hasn&apos;t remembered anything factual yet. Ask it to remember your name or project!</span>}
                    </div>

                    <h4 style={{ margin: "0 0 8px", fontSize: "0.875rem", color: "var(--text-primary)" }}>Past Sessions</h4>
                    {pastSessions.length === 0 ? (
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>No previous sessions found.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "120px", overflowY: "auto" }}>
                            {pastSessions.map((sess) => (
                                <div key={sess.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", background: "var(--bg-primary)", borderRadius: "6px", border: "1px solid var(--border-primary)" }}>
                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{sess.id}</span>
                                        <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{new Date(sess.created_at).toLocaleString()}</span>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: "4px 12px", fontSize: "0.75rem", borderRadius: "12px" }}
                                        onClick={() => onLoadHistory(sess.id)}
                                        disabled={isLoadingHistory}
                                    >
                                        {isLoadingHistory ? "..." : "Load History"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                    <button onClick={onClose} className="btn btn-primary">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
