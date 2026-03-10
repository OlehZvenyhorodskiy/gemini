"use client";

import { useState, useEffect } from "react";
import type { AgentMode } from "@/hooks";
import type { ModeInfo } from "@/lib/constants";

/**
 * OnboardingOverlay — spotlight-based tutorial for first-time users.
 *
 * Step 0: highlights a random mode card via DOM measurement
 * Step 1: highlights the Connect button
 *
 * Previously lived inside page.tsx as a standalone function component.
 * Moved here to keep the page orchestrator clean.
 */
interface OnboardingProps {
    step: number;
    highlightedMode: AgentMode;
    modeInfo: Record<AgentMode, ModeInfo>;
    onNext: (dir?: number) => void;
    onSkip: () => void;
}

export function OnboardingOverlay({ step, highlightedMode, modeInfo, onNext, onSkip }: OnboardingProps) {
    const [spotlight, setSpotlight] = useState<{ x: number; y: number; r: number } | null>(null);

    useEffect(() => {
        const updateSpotlight = () => {
            let el: HTMLElement | null = null;
            if (step === 0) {
                el = document.getElementById(`mode-card-${highlightedMode}`);
            } else if (step === 1) {
                el = document.getElementById("connect-btn");
            }
            if (el) {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const radius = Math.max(rect.width, rect.height) / 2 + 20;
                setSpotlight({ x: cx, y: cy, r: radius });
            }
        };

        // Brief delay so the DOM paints before we measure
        const timer = setTimeout(updateSpotlight, 100);
        window.addEventListener("resize", updateSpotlight);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", updateSpotlight);
        };
    }, [step, highlightedMode]);

    const STEPS = [
        {
            title: "Choose your agent",
            desc: `Click any model card to select it — try "${modeInfo[highlightedMode].label}"!`,
        },
        {
            title: "Ready to go",
            desc: "Click on the button Connect to start using the agent.",
        },
    ];

    const current = STEPS[step] || STEPS[0];

    return (
        <div className="onboarding-overlay">
            {/* SVG mask — full viewport with a circular cutout */}
            <svg className="onboarding-mask" viewBox={`0 0 ${typeof window !== "undefined" ? window.innerWidth : 1920} ${typeof window !== "undefined" ? window.innerHeight : 1080}`} preserveAspectRatio="none">
                <defs>
                    <mask id="spotlight-mask">
                        <rect width="100%" height="100%" fill="white" />
                        {spotlight && (
                            <circle cx={spotlight.x} cy={spotlight.y} r={spotlight.r} fill="black" />
                        )}
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.85)" mask="url(#spotlight-mask)" />
            </svg>

            {/* Pulsing ring around spotlight + target highlight */}
            {spotlight && (
                <>
                    <div
                        className="spotlight-pulse"
                        style={{
                            left: spotlight.x - spotlight.r,
                            top: spotlight.y - spotlight.r,
                            width: spotlight.r * 2,
                            height: spotlight.r * 2,
                        }}
                    />
                    {step === 0 && (
                        <div
                            className="onboarding-target-highlight"
                            style={{
                                left: document.getElementById(`mode-card-${highlightedMode}`)?.getBoundingClientRect().left || spotlight.x - 100,
                                top: document.getElementById(`mode-card-${highlightedMode}`)?.getBoundingClientRect().top || spotlight.y - 100,
                                width: document.getElementById(`mode-card-${highlightedMode}`)?.getBoundingClientRect().width || 200,
                                height: document.getElementById(`mode-card-${highlightedMode}`)?.getBoundingClientRect().height || 200,
                                borderRadius: "16px",
                            }}
                        />
                    )}
                    {step === 1 && (
                        <div
                            className="onboarding-target-highlight"
                            style={{
                                left: document.getElementById("connect-btn")?.getBoundingClientRect().left || spotlight.x - 100,
                                top: document.getElementById("connect-btn")?.getBoundingClientRect().top || spotlight.y - 30,
                                width: document.getElementById("connect-btn")?.getBoundingClientRect().width || 200,
                                height: document.getElementById("connect-btn")?.getBoundingClientRect().height || 60,
                                borderRadius: "28px",
                            }}
                        />
                    )}
                </>
            )}

            {/* Hint card */}
            <div className="onboarding-hint" style={{
                top: spotlight ? Math.min(spotlight.y + spotlight.r + 24, window.innerHeight - 200) : "50%",
                left: "50%",
                transform: "translateX(-50%)",
            }}>
                <div className="onboarding-step-badge">Step {step + 1} of {STEPS.length}</div>
                <h3 className="onboarding-hint-title">{current.title}</h3>
                <p className="onboarding-hint-desc">{current.desc}</p>

                {/* Step indicator dots */}
                <div className="onboarding-dots">
                    {STEPS.map((_, i) => (
                        <span key={i} className={`onboarding-dot ${i === step ? "active" : i < step ? "done" : ""}`} />
                    ))}
                </div>

                {/* Nav buttons */}
                <div className="onboarding-actions">
                    <button className="onboarding-btn-skip" onClick={onSkip}>
                        Skip guide
                    </button>
                    {step > 0 && (
                        <button className="onboarding-btn-prev" onClick={() => onNext(-1)}>
                            Previous
                        </button>
                    )}
                    {step < STEPS.length - 1 && (
                        <button className="onboarding-btn-next" onClick={() => onNext(1)}>
                            Next Step →
                        </button>
                    )}
                    {step === STEPS.length - 1 && (
                        <button className="onboarding-btn-next" onClick={onSkip}>
                            Finish
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
