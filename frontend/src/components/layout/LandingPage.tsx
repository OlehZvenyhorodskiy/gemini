"use client";

import { useRef, useState } from "react";
import type { AgentMode } from "@/hooks";
import type { UseThemeReturn } from "@/hooks";
import { MODE_INFO, ALL_MODES } from "@/lib/constants";
import { ThemePicker } from "@/components/ui/ThemePicker";

/**
 * LandingPage — the full-screen hero page visitors see first.
 *
 * Contains the NEXUS logo, tagline, feature pills, CTA buttons,
 * and an interactive agent carousel. Completely self-contained —
 * no WebSocket or audio state needed.
 */
interface LandingPageProps {
    /** Mouse position for the interactive cursor glow effect */
    mousePos: { x: number; y: number };
    /** Called when user clicks "Get Started" */
    onDismiss: () => void;
    /** Theme hook return values for the ThemePicker */
    themeHook: UseThemeReturn;
}

export function LandingPage({ mousePos, onDismiss, themeHook }: LandingPageProps) {
    const agentCarouselRef = useRef<HTMLDivElement>(null);
    const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);

    const scrollToCarousel = () => {
        const container = document.querySelector('.landing-page-scroll-container');
        const target = agentCarouselRef.current;
        if (container && target) {
            const startPos = container.scrollTop;
            const endPos = target.offsetTop;
            const distance = endPos - startPos;
            const duration = 800;
            let startTime: number | null = null;

            function animation(currentTime: number) {
                if (startTime === null) startTime = currentTime;
                const timeElapsed = currentTime - startTime;
                const progress = Math.min(timeElapsed / duration, 1);

                // Ease in-out cubic
                const ease = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

                if (container) {
                    container.scrollTo(0, startPos + (distance * ease));
                }

                if (timeElapsed < duration) {
                    requestAnimationFrame(animation);
                }
            }
            requestAnimationFrame(animation);
        }
    };

    return (
        <div className="landing-page-scroll-container relative">
            {/* Top Right Actions (Customise) */}
            <div className="landing-top-right-actions">
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
            </div>

            <div className="landing-page">
                {/* Interactive Cursor Glow */}
                <div
                    className="cursor-glow"
                    style={{
                        transform: `translate(${mousePos.x}px, ${mousePos.y}px)`
                    }}
                />
                <div className="landing-logo">
                    <span style={{ color: "var(--google-blue)" }}>N</span>
                    <span style={{ color: "var(--google-red)" }}>E</span>
                    <span style={{ color: "var(--google-yellow)" }}>X</span>
                    <span style={{ color: "var(--google-blue)" }}>U</span>
                    <span style={{ color: "var(--google-green)" }}>S</span>
                </div>
                <p className="landing-tagline">
                    Redefining AI Interaction — your multimodal agent that
                    sees, hears, speaks, and creates in real-time.
                </p>
                <div className="landing-features">
                    <div className="feature-pill">
                        <span className="feat-icon">👁️</span>
                        <span className="feat-label">See</span>
                        <span className="feat-desc">Camera &amp; screen vision</span>
                    </div>
                    <div className="feature-pill">
                        <span className="feat-icon">👂</span>
                        <span className="feat-label">Hear</span>
                        <span className="feat-desc">Real-time audio input</span>
                    </div>
                    <div className="feature-pill">
                        <span className="feat-icon">🗣️</span>
                        <span className="feat-label">Speak</span>
                        <span className="feat-desc">Natural voice output</span>
                    </div>
                    <div className="feature-pill">
                        <span className="feat-icon">✨</span>
                        <span className="feat-label">Create</span>
                        <span className="feat-desc">Text, images &amp; media</span>
                    </div>
                </div>
                <div className="landing-cta-group">
                    <button className="landing-cta" onClick={onDismiss}>
                        Get Started →
                    </button>
                    <button className="landing-cta landing-cta-secondary" onClick={scrollToCarousel}>
                        About agents ↓
                    </button>
                </div>
                <span className="landing-version">Powered by Google Gemini · Built for #GeminiLiveAgentChallenge</span>
            </div>

            {/* Interactive Agent Carousel Section */}
            <div className="agent-carousel-section" ref={agentCarouselRef}>
                <h2 className="carousel-title">Meet the Agents</h2>
                <div className="carousel-container">
                    <button className="carousel-arrow left" onClick={() => setActiveCarouselIndex(prev => (prev - 1 + ALL_MODES.length) % ALL_MODES.length)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>

                    <div className="carousel-track">
                        {ALL_MODES.map((modeId, index) => {
                            const diff = (index - activeCarouselIndex + ALL_MODES.length) % ALL_MODES.length;
                            let positionClass = "hidden";
                            if (diff === 0) positionClass = "active";
                            else if (diff === 1 || diff === -(ALL_MODES.length - 1)) positionClass = "next";
                            else if (diff === ALL_MODES.length - 1 || diff === -1) positionClass = "prev";

                            return (
                                <div key={modeId} className={`carousel-card ${positionClass}`} onClick={() => setActiveCarouselIndex(index)}>
                                    <div className="carousel-icon">{MODE_INFO[modeId].emoji}</div>
                                    <div className="carousel-label">{MODE_INFO[modeId].label}</div>
                                </div>
                            );
                        })}
                    </div>

                    <button className="carousel-arrow right" onClick={() => setActiveCarouselIndex(prev => (prev + 1) % ALL_MODES.length)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                    </button>

                    <div className="carousel-info-panel">
                        <h3>{MODE_INFO[ALL_MODES[activeCarouselIndex]]?.label}</h3>
                        <p>{MODE_INFO[ALL_MODES[activeCarouselIndex]]?.description}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
