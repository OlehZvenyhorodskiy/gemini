"use client";

/**
 * ThinkingIndicator — animated dot-pulse shown while the agent
 * is processing (thinking state) or executing a tool call.
 *
 * Three dots pulse sequentially — feels alive without being
 * distracting. Accepts an optional label for tool-specific
 * feedback (e.g., "Searching the web...").
 */

interface ThinkingIndicatorProps {
    label?: string;
}

export function ThinkingIndicator({ label }: ThinkingIndicatorProps) {
    return (
        <div
            className="thinking-indicator"
            role="status"
            aria-label={label || "Agent is thinking"}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 18px",
                borderRadius: "14px",
                backgroundColor: "var(--glass-bg)",
                backdropFilter: "blur(12px)",
                border: "1px solid var(--glass-border)",
                maxWidth: "320px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.05)",
                animation: "fadeIn 0.3s ease-out",
            }}
        >
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "var(--google-blue)",
                            boxShadow: "0 0 8px var(--google-blue)",
                            animation: `thinkingPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                        }}
                    />
                ))}
            </div>
            {label && (
                <span
                    style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                        letterSpacing: "0.01em",
                    }}
                >
                    {label}
                </span>
            )}
        </div>
    );
}

/**
 * ConnectionBanner — non-intrusive top banner shown when the
 * WebSocket connection is lost. Auto-hides when reconnected.
 */
interface ConnectionBannerProps {
    isConnected: boolean;
    agentState: string;
}

export function ConnectionBanner({ isConnected, agentState }: ConnectionBannerProps) {
    if (isConnected && agentState !== "disconnected") return null;

    return (
        <div
            role="alert"
            aria-live="polite"
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "10px 20px",
                background: "linear-gradient(135deg, rgba(234, 67, 53, 0.9), rgba(234, 67, 53, 0.7))",
                backdropFilter: "blur(12px)",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 600,
                animation: "slideDownBanner 0.3s ease-out",
            }}
        >
            {/* Spinning reconnect icon */}
            <span
                style={{
                    display: "inline-block",
                    animation: "spin 1.2s linear infinite",
                    fontSize: "1rem",
                }}
            >
                ⟳
            </span>
            <span>Connection lost — reconnecting...</span>
        </div>
    );
}
