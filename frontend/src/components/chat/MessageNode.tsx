"use client";

import type { ChatMessage, AgentMode } from "@/hooks";

/**
 * MessageNode — renders a single chat message in the spatial canvas layout.
 *
 * Handles all message types: text, image, tool (with generative UI widgets
 * like timer, weather, story choice buttons), and error messages.
 *
 * Each node is absolutely positioned in the spatial canvas based on its
 * index and role (user messages sit on the right, agent on the left).
 */
interface MessageNodeProps {
    msg: ChatMessage;
    index: number;
    messages: ChatMessage[];
    mode: AgentMode;
    /** Called when user clicks a suggestion inside a tool card */
    onSendText: (text: string) => void;
    wsRef: React.MutableRefObject<WebSocket | null>;
    addMessage: (
        role: "user" | "agent",
        type: ChatMessage["type"],
        content: string,
    ) => void;
}

export function MessageNode({
    msg,
    index,
    messages,
    mode,
    onSendText,
    wsRef,
    addMessage,
}: MessageNodeProps) {
    const row = index;
    const isUser = msg.role === "user";
    const xBase = 250;
    const spacingY = 180;
    const posX = isUser ? xBase : -xBase;
    const posY = row * spacingY;

    // Connection line to previous node
    let prevPosX = 0;
    let prevPosY = 0;
    if (index > 0) {
        const prevIsUser = messages[index - 1].role === "user";
        prevPosX = prevIsUser ? xBase : -xBase;
        prevPosY = (index - 1) * spacingY;
    }

    return (
        <div key={msg.id}>
            {index > 0 && (
                <svg className="spatial-connection pointer-events-none" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", zIndex: -1 }}>
                    <path
                        d={`M ${prevPosX} ${prevPosY + 40} C ${prevPosX} ${posY - 40}, ${posX} ${prevPosY + 80}, ${posX} ${posY - 20}`}
                        fill="none"
                        stroke="var(--glass-border)"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                    />
                </svg>
            )}
            <div
                className={`message-row ${msg.role} spatial-node`}
                style={{
                    position: "absolute",
                    transform: `translate(calc(-50% + ${posX}px), ${posY}px)`,
                    width: "400px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                    borderRadius: "16px",
                    padding: "16px",
                    background: isUser ? "var(--bg-card)" : "var(--glass-bg)",
                    backdropFilter: isUser ? "none" : "blur(12px)",
                    border: "1px solid var(--border-primary)"
                }}
            >
                <div className={`avatar ${msg.role === "user" ? "user-avatar" : "agent-avatar"}`}>
                    {msg.role === "user" ? "U" : "✦"}
                </div>
                <div>
                    {msg.type === "tool" ? (
                        <div className="tool-card">
                            <div className="tool-name">🔧 {msg.toolName}</div>

                            {/* Generative UI Widget: Timer */}
                            {msg.toolName === "render_widget" && msg.toolArgs && (
                                <div className="mt-3 mb-1">
                                    {(() => {
                                        let wData: Record<string, unknown> = {};
                                        try { wData = typeof msg.toolArgs.data === "string" ? JSON.parse(msg.toolArgs.data as string) : (msg.toolArgs.data as Record<string, unknown>) || {}; } catch { /* noop */ }

                                        if (msg.toolArgs.widget_type === "timer") {
                                            return (
                                                <div className="p-4 rounded-xl border border-[var(--google-red)] bg-red-500/10 flex items-center gap-4 w-64">
                                                    <span className="text-3xl animate-pulse">⏱️</span>
                                                    <div>
                                                        <div className="text-xl font-bold font-mono tracking-widest text-[var(--text-primary)]">{(wData.minutes as number) || 5}:00</div>
                                                        <div className="text-xs uppercase tracking-wider text-[var(--google-red)] font-semibold mt-1">Countdown Active</div>
                                                    </div>
                                                </div>
                                            );
                                        } else if (msg.toolArgs.widget_type === "weather") {
                                            return (
                                                <div className="p-5 rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center gap-6 w-80 shadow-lg backdrop-blur-md">
                                                    <span className="text-5xl drop-shadow-md">{wData.temp && parseInt(String(wData.temp)) > 60 ? "☀️" : "🌧️"}</span>
                                                    <div>
                                                        <div className="text-sm uppercase tracking-widest text-[var(--text-tertiary)] mb-1 font-semibold">{(wData.location as string) || "City"}</div>
                                                        <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">{(wData.temp as string) || "68"}°</div>
                                                        <div className="text-sm font-medium text-[var(--text-secondary)] mt-1">{(wData.condition as string) || "Partly Cloudy"}</div>
                                                    </div>
                                                </div>
                                            );
                                        } else if (msg.toolArgs.widget_type === "poll") {
                                            /* Interactive poll widget — renders voting buttons with animated progress bars */
                                            const question = (wData.question as string) || "What do you think?";
                                            const options = (wData.options as string[]) || ["Option A", "Option B"];
                                            const pollColors = ["var(--google-blue)", "var(--google-red)", "var(--google-green)", "var(--google-yellow)"];
                                            return (
                                                <div className="p-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--glass-bg)] backdrop-blur-md w-80 shadow-lg">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-xl">📊</span>
                                                        <div className="text-sm font-bold text-[var(--text-primary)] leading-tight">{question}</div>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        {options.map((opt: string, idx: number) => {
                                                            const color = pollColors[idx % pollColors.length];
                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    className="relative overflow-hidden rounded-lg p-3 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                                                                    style={{
                                                                        border: `1px solid ${color}30`,
                                                                        background: `${color}10`,
                                                                    }}
                                                                    onClick={() => {
                                                                        addMessage("user", "text", `I vote: ${opt}`);
                                                                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                                            wsRef.current.send(JSON.stringify({ type: "text", content: `I vote: ${opt}` }));
                                                                        }
                                                                    }}
                                                                >
                                                                    <span className="relative z-10 text-sm font-medium text-[var(--text-primary)]">{opt}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        } else if (msg.toolArgs.widget_type === "chart") {
                                            /* Bar chart widget — renders inline SVG bars with labels */
                                            const labels = (wData.labels as string[]) || ["A", "B", "C"];
                                            const values = (wData.values as number[]) || [30, 70, 50];
                                            const maxVal = Math.max(...values, 1);
                                            const chartColors = ["#4285F4", "#EA4335", "#34A853", "#FBBC05"];
                                            const barWidth = 36;
                                            const chartHeight = 120;
                                            const chartWidth = labels.length * (barWidth + 16) + 16;
                                            return (
                                                <div className="p-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--glass-bg)] backdrop-blur-md shadow-lg" style={{ width: Math.max(chartWidth + 32, 200) }}>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-xl">📈</span>
                                                        <span className="text-sm font-bold text-[var(--text-primary)]">{(wData.title as string) || "Chart"}</span>
                                                    </div>
                                                    <svg width={chartWidth} height={chartHeight + 32} viewBox={`0 0 ${chartWidth} ${chartHeight + 32}`}>
                                                        {/* Baseline */}
                                                        <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="var(--border-primary)" strokeWidth="1" />
                                                        {labels.map((label: string, idx: number) => {
                                                            const barH = (values[idx] / maxVal) * (chartHeight - 8);
                                                            const x = 16 + idx * (barWidth + 16);
                                                            const y = chartHeight - barH;
                                                            const color = chartColors[idx % chartColors.length];
                                                            return (
                                                                <g key={idx}>
                                                                    <rect x={x} y={y} width={barWidth} height={barH} rx={4} fill={color} fillOpacity={0.8}>
                                                                        <animate attributeName="height" from="0" to={barH} dur="0.6s" fill="freeze" />
                                                                        <animate attributeName="y" from={chartHeight} to={y} dur="0.6s" fill="freeze" />
                                                                    </rect>
                                                                    <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Google Sans, Inter, sans-serif">{label}</text>
                                                                    <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fill="var(--text-tertiary)" fontSize="9" fontFamily="Google Sans, Inter, sans-serif">{values[idx]}</text>
                                                                </g>
                                                            );
                                                        })}
                                                    </svg>
                                                </div>
                                            );
                                        }
                                        return <pre>{JSON.stringify(msg.toolArgs, null, 2)}</pre>;
                                    })()}
                                </div>
                            )}

                            {/* Director's Cut (Story Choices) */}
                            {msg.toolName === "propose_story_choices" && msg.toolArgs && (() => {
                                const args = msg.toolArgs as Record<string, unknown>;
                                return (
                                    <div className="flex gap-3 mt-4 mb-2 flex-col sm:flex-row w-full max-w-2xl">
                                        <button
                                            className="flex-1 p-4 rounded-xl border border-[var(--google-blue)] bg-[var(--google-blue)]/10 hover:bg-[var(--google-blue)]/20 transition-all text-left group shadow-lg"
                                            onClick={() => {
                                                const choice = args.choice_a as string;
                                                addMessage("user", "text", `I choose: ${choice}`);
                                                if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                    wsRef.current.send(JSON.stringify({ type: "text", content: `I choose: ${choice}` }));
                                                }
                                            }}
                                        >
                                            <div className="flex items-center">
                                                <span className="text-2xl mr-3 group-hover:scale-110 inline-block transition-transform duration-300">✨</span>
                                                <span className="font-semibold text-[var(--text-primary)] leading-tight">{args.choice_a as string}</span>
                                            </div>
                                        </button>
                                        <button
                                            className="flex-1 p-4 rounded-xl border border-[var(--google-red)] bg-[var(--google-red)]/10 hover:bg-[var(--google-red)]/20 transition-all text-left group shadow-lg"
                                            onClick={() => {
                                                const choice = args.choice_b as string;
                                                addMessage("user", "text", `I choose: ${choice}`);
                                                if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                    wsRef.current.send(JSON.stringify({ type: "text", content: `I choose: ${choice}` }));
                                                }
                                            }}
                                        >
                                            <div className="flex items-center">
                                                <span className="text-2xl mr-3 group-hover:scale-110 inline-block transition-transform duration-300">🔮</span>
                                                <span className="font-semibold text-[var(--text-primary)] leading-tight">{args.choice_b as string}</span>
                                            </div>
                                        </button>
                                    </div>
                                );
                            })()}

                            {msg.toolArgs && msg.toolName !== "render_widget" && msg.toolName !== "propose_story_choices" && (
                                <pre>{JSON.stringify(msg.toolArgs, null, 2)}</pre>
                            )}
                            {msg.toolResult && !(msg.toolResult as Record<string, unknown>).screenshot && (
                                <pre style={{ color: "var(--google-green)" }}>
                                    {JSON.stringify(msg.toolResult, null, 2)}
                                </pre>
                            )}
                            {Boolean((msg.toolResult as Record<string, unknown>)?.screenshot) && (
                                <div className="canvas-reference" style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "8px" }}>
                                    🖼️ Screenshot captured (View in Canvas →)
                                </div>
                            )}
                        </div>
                    ) : msg.type === "image" ? (
                        <div className={`message-bubble ${msg.type}`}>
                            <p style={{ margin: "0 0 8px" }}>{msg.content}</p>
                            {msg.imageData && !["creative", "navigator", "code"].includes(mode) && (
                                <img
                                    src={`data:${msg.imageMime || "image/png"};base64,${msg.imageData}`}
                                    alt="Generated"
                                    className="message-image"
                                />
                            )}
                            {msg.imageData && ["creative", "navigator", "code"].includes(mode) && (
                                <div className="canvas-reference" style={{ color: "var(--google-blue)", fontSize: "0.85rem", fontWeight: 500 }}>
                                    🖼️ View full size in Canvas →
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`message-bubble ${msg.type === "error" ? "error" : ""}`}>
                            {msg.type === "error" ? (
                                <div className="message-bubble error">{msg.content}</div>
                            ) : (
                                msg.content
                            )}
                            <div className="message-time">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
