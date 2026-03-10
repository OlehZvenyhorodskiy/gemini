"use client";

import { useMemo } from "react";
import type { AgentMode } from "@/hooks";
import { MODE_INFO, ALL_MODES, type CustomAgent } from "@/lib/constants";

/**
 * ModeHub — the disconnected-state mode selection grid.
 *
 * Shows quick-start instructions, a search bar to filter agents,
 * the mode card grid, a "Create Your Agent" card, and any
 * user-defined custom agents from localStorage.
 */
interface ModeHubProps {
    mode: AgentMode;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    customAgents: CustomAgent[];
    showOnboarding: boolean;
    onboardingStep: number;
    onSelectMode: (m: AgentMode) => void;
    onConnect: () => void;
    onNextOnboardingStep: () => void;
    onCreateAgent: () => void;
}

export function ModeHub({
    mode,
    searchQuery,
    onSearchChange,
    customAgents,
    showOnboarding,
    onboardingStep,
    onSelectMode,
    onConnect,
    onNextOnboardingStep,
    onCreateAgent,
}: ModeHubProps) {
    const filteredModes = useMemo(() => {
        if (!searchQuery.trim()) return ALL_MODES;
        const q = searchQuery.toLowerCase();
        return ALL_MODES.filter(
            (m) => MODE_INFO[m].label.toLowerCase().includes(q) || MODE_INFO[m].description.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    return (
        <div className="mode-hub">
            {/* Quick start instructions */}
            <div className="quick-start-panel">
                <h3 className="quick-start-title">🚀 How to Get Started</h3>
                <ol className="quick-start-steps">
                    <li><strong>Choose a mode</strong> — Pick the AI agent that fits your task</li>
                    <li><strong>Click Connect</strong> — Establishes a live session with NEXUS</li>
                    <li><strong>Start talking or typing</strong> — Use your mic, camera, or text to interact</li>
                </ol>
            </div>

            {/* Search bar */}
            <div className="search-bar-wrapper">
                <div className="search-bar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search agents..."
                    />
                </div>
            </div>

            {/* Mode grid */}
            <div className="mode-grid animate-slide-up">
                {filteredModes.map((m) => (
                    <button
                        key={m}
                        id={`mode-card-${m}`}
                        className={`mode-card ${mode === m ? "active" : ""}`}
                        onClick={() => {
                            onSelectMode(m);
                            // During onboarding step 0, just select — don't auto-connect
                            if (showOnboarding && onboardingStep === 0) {
                                onNextOnboardingStep();
                            } else {
                                onConnect();
                            }
                        }}
                    >
                        <span className="mode-icon">{MODE_INFO[m].emoji}</span>
                        <span className="mode-label">{MODE_INFO[m].label}</span>
                        <span className="mode-desc">{MODE_INFO[m].description}</span>
                    </button>
                ))}

                {/* Create Your Agent */}
                <button
                    className="mode-card create-agent"
                    onClick={onCreateAgent}
                >
                    <span className="mode-icon">✨</span>
                    <span className="mode-label">Create Your Agent</span>
                    <span className="mode-desc">Build a custom AI mode</span>
                </button>

                {/* Custom agents */}
                {customAgents.map((ca) => (
                    <button
                        key={ca.id}
                        className="mode-card"
                        onClick={() => {
                            onSelectMode("live");
                            onConnect();
                        }}
                    >
                        <span className="mode-icon">{ca.emoji}</span>
                        <span className="mode-label">{ca.name}</span>
                        <span className="mode-desc">{ca.description}</span>
                    </button>
                ))}
            </div>

            {/* Tagline below cards */}
            <p style={{
                fontSize: "0.8125rem",
                color: "var(--text-tertiary)",
                textAlign: "center",
                maxWidth: 420,
                lineHeight: 1.5,
            }}>
                Choose an agent above and connect to start your multimodal AI session.
            </p>
        </div>
    );
}
