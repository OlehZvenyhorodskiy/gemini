"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import {
    useTheme, useAudioEngine, useNexusSocket, useMediaCapture, useJediMode,
    ALL_THEMES,
} from "@/hooks";
import type {
    ThemeMode, ServerMessage, ChatMessage,
} from "@/hooks";
import { MODE_INFO, WS_URL, type CustomAgent } from "@/lib/constants";
import type { AgentMode } from "@/hooks";
import type { BBox } from "@/components/visualizer/VideoPreview";

// Components
import { LandingPage } from "@/components/layout/LandingPage";
import { AppHeader } from "@/components/layout/AppHeader";
import { OnboardingOverlay } from "@/components/layout/OnboardingOverlay";
import { ModeHub } from "@/components/chat/ModeHub";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { VideoPreview } from "@/components/visualizer/VideoPreview";
import { SettingsModal } from "@/components/chat/SettingsModal";
import { CreateAgentModal } from "@/components/chat/CreateAgentModal";

/**
 * NexusPage — the top-level orchestrator.
 *
 * All business logic lives in hooks (useTheme, useAudioEngine,
 * useNexusSocket, useMediaCapture, useJediMode). All rendering
 * is delegated to focused components. This file only wires them
 * together and manages app-level state/effects.
 */
export default function NexusPage() {
    // =============================================
    //  HOOK COMPOSITIONS
    // =============================================

    const themeHook = useTheme();
    const { theme, switchTheme } = themeHook;

    const {
        audioQueueRef, isPlayingRef, playbackCtxRef, captureCtxRef,
        outputAnalyserRef,
        handleAudioResponse, playNextChunk, flushAudio,
    } = useAudioEngine();

    // --- UI-only state ---
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
    const [persona, setPersona] = useState<string>("default");
    const [isHandsFree, setIsHandsFree] = useState<boolean>(false);
    const [boundingBoxes, setBoundingBoxes] = useState<BBox[]>([]);
    const [userFacts, setUserFacts] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
    const [newAgent, setNewAgent] = useState<Partial<CustomAgent>>({});
    const [showLanding, setShowLanding] = useState(true);
    const [pastSessions, setPastSessions] = useState<Array<{ id: string; created_at: string }>>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState(0);
    const [highlightedMode] = useState<AgentMode>(() => {
        const candidates: AgentMode[] = ["live", "creative", "navigator", "code", "research"];
        return candidates[Math.floor(Math.random() * candidates.length)];
    });
    const [sessionElapsed, setSessionElapsed] = useState("");
    const [mousePos, setMousePos] = useState({ x: -100, y: -100 });

    const constellationRef = useRef<HTMLCanvasElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastInteractionRef = useRef<number>(Date.now());

    // --- Server message callback (wired into useNexusSocket) ---
    const handleServerMessageFromHook = useCallback((msg: ServerMessage) => {
        switch (msg.type) {
            case "audio":
                if (msg.data) handleAudioResponse(msg.data);
                break;
            case "text": {
                let textContent = msg.content || "";
                const bboxRegex = /\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g;
                let match;
                const newBoxes: BBox[] = [];
                while ((match = bboxRegex.exec(textContent)) !== null) {
                    newBoxes.push({
                        id: `box-${Date.now()}-${Math.random()}`,
                        ymin: parseInt(match[1]), xmin: parseInt(match[2]),
                        ymax: parseInt(match[3]), xmax: parseInt(match[4]),
                        label: "TARGET_LOCKED", createdAt: Date.now(),
                    });
                }
                if (newBoxes.length > 0) {
                    setBoundingBoxes(prev => [...prev, ...newBoxes].slice(-10));
                    setTimeout(() => {
                        setBoundingBoxes(prev => prev.filter(b => Date.now() - b.createdAt < 4500));
                    }, 5000);
                }
                textContent = textContent.replace(bboxRegex, "").trim();
                // Text messages are added via handleServerMessageWithChat below
                break;
            }
            case "image":
                if (msg.data) {
                    audioQueueRef.current.push({
                        type: "image", data: msg.data, mime: msg.mime || "image/jpeg",
                    });
                    if (!isPlayingRef.current) {
                        isPlayingRef.current = true;
                        requestAnimationFrame(() => playNextChunk((data, mime) => {
                            nexusSocket.addMessage("agent", "image", "Generated image", data, mime);
                        }));
                    }
                }
                break;
            case "tool_call":
                // Chameleon UI — agent can change the theme via tool use
                if (msg.name === "change_ui_theme" && msg.args?.theme) {
                    const t = msg.args.theme as ThemeMode;
                    if (ALL_THEMES.includes(t)) switchTheme(t);
                }
                break;
            case "tool_result": {
                const result = msg.result as Record<string, unknown> | undefined;
                if (result?.screenshot && typeof result.screenshot === "string") {
                    setLatestScreenshot(result.screenshot);
                }
                
                if (result?.consultation_result && typeof result.consultation_result === "string") {
                    const text = result.consultation_result;
                    const specialty = (result.specialty as string) || "research";
                    speakWithSubAgent(text, specialty);
                }
                break;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleAudioResponse, audioQueueRef, isPlayingRef, playNextChunk, switchTheme]);

    // WebSocket lifecycle, chat state, message routing
    const nexusSocket = useNexusSocket(handleServerMessageFromHook, persona, flushAudio);
    const {
        wsRef, isConnected, sessionId, agentState,
        messages, setMessages, textInput, setTextInput,
        mode, setMode,
        connectWebSocket, disconnectWebSocket, sendTextMessage, switchMode, sendInterrupt,
        addMessage, addSystemMessage,
    } = nexusSocket;

    // Handle text messages that were parsed for bounding boxes above
    // (needs addMessage which comes from nexusSocket)
    useEffect(() => {
        // This effect is a one-time setup — the actual text addition
        // happens inside handleServerMessageFromHook when msg.type === "text"
        // We use a separate listener approach via onServerMessage callback
    }, []);

    // Jedi Mode (gesture recognition)
    const {
        handLandmarkerRef, currentGesture, processGestures,
    } = useJediMode(
        () => mediaCapture.stopRecording(),
        addSystemMessage,
        setIsHandsFree,
    );

    // Media capture (mic, camera, screen share, visualizer, VAD)
    const mediaCapture = useMediaCapture(
        wsRef, sendInterrupt, addSystemMessage,
        isPlayingRef, audioQueueRef, mode,
        processGestures, handLandmarkerRef,
        captureCtxRef,
    );
    const {
        isRecording, isCameraOn, isScreenSharing,
        canvasRef, videoRef, analyserRef,
        toggleRecording, stopRecording, toggleCamera, toggleScreenShare, stopVideoCapture,
        startVisualizer,
    } = mediaCapture;

    // =============================================
    //  EFFECTS
    // =============================================

    // Premium cursor tracking
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => { setMousePos({ x: e.clientX, y: e.clientY }); };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Proactive mind reader — triggers after 30s of inactivity
    useEffect(() => {
        const handleInteraction = () => { lastInteractionRef.current = Date.now(); };
        window.addEventListener("mousemove", handleInteraction);
        window.addEventListener("keydown", handleInteraction);
        window.addEventListener("click", handleInteraction);
        window.addEventListener("touchstart", handleInteraction);

        const proactiveInterval = setInterval(() => {
            if (!isConnected || isRecording || mode === "creative") return;

            const now = Date.now();
            if (now - lastInteractionRef.current > 30000) {
                console.log("[NEXUS] Inactivity detected. Triggering proactive mind reader...");
                lastInteractionRef.current = now + 60000;

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    const proactivePrompt = "[SYSTEM INSTRUCTION: The user has been completely silent and inactive for 30 seconds. Look at their screen (if video is on) or review the conversation history. If you see an error, something interesting, or want to suggest a next step, speak up proactively now. If everything looks fine, just ask a brief check-in question. Keep it very short and natural.]";
                    wsRef.current.send(JSON.stringify({ type: "text", content: proactivePrompt }));
                }
            }
        }, 5000);

        return () => {
            window.removeEventListener("mousemove", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            window.removeEventListener("click", handleInteraction);
            window.removeEventListener("touchstart", handleInteraction);
            clearInterval(proactiveInterval);
        };
    }, [isConnected, isRecording, mode, wsRef]);

    // Fetch user facts + past sessions when settings opens
    useEffect(() => {
        if (isSettingsOpen) {
            const userId = localStorage.getItem("nexus_user_id");
            if (userId) {
                const baseUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "");

                fetch(`${baseUrl}/api/user/${userId}/profile`)
                    .then(r => r.json())
                    .then(data => { setUserFacts(data.facts || "No memories yet."); })
                    .catch(e => console.error("Failed to fetch memory:", e));

                fetch(`${baseUrl}/api/sessions`)
                    .then(r => r.json())
                    .then(data => { setPastSessions(data.sessions || []); })
                    .catch(e => console.error("Failed to fetch sessions:", e));
            }
        }
    }, [isSettingsOpen]);

    // Load custom agents and onboarding flag from localStorage
    useEffect(() => {
        try {
            const savedAgents = localStorage.getItem("nexus-custom-agents");
            if (savedAgents) { setCustomAgents(JSON.parse(savedAgents)); }
        } catch { /* noop */ }

        try {
            const onboarded = localStorage.getItem("nexus-onboarding-done");
            if (onboarded === "true") setShowOnboarding(false);
        } catch { /* noop */ }
    }, []);

    // Constellation canvas animation
    useEffect(() => {
        const canvas = constellationRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId = 0;
        const PARTICLE_COUNT = 55;
        const MAX_DIST = 120;
        const COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];

        interface Particle { x: number; y: number; vx: number; vy: number; r: number; color: string; }

        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener("resize", resize);

        const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
            x: Math.random() * canvas.width, y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
            r: Math.random() * 2.5 + 1,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
        }));

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < MAX_DIST) {
                        const opacity = (1 - dist / MAX_DIST) * 0.15;
                        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            for (const p of particles) {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
            }
            animId = requestAnimationFrame(draw);
        };
        draw();

        return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
    }, []);

    // Session timer
    useEffect(() => {
        if (!isConnected) { setSessionElapsed(""); return; }
        const start = Date.now();
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
            const secs = (elapsed % 60).toString().padStart(2, "0");
            setSessionElapsed(`${mins}:${secs}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [isConnected]);

    // Auto-scroll chat
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    // Start audio visualizer after recording begins
    useEffect(() => { if (isRecording && analyserRef.current) startVisualizer(); }, [isRecording, startVisualizer, analyserRef]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { stopRecording(); stopVideoCapture(); if (playbackCtxRef.current) playbackCtxRef.current.close(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // =============================================
    //  CALLBACKS
    // =============================================

    const dismissLanding = useCallback(() => {
        setShowLanding(false);
        try { localStorage.setItem("nexus-visited", "true"); } catch { /* noop */ }
        try {
            const onboarded = localStorage.getItem("nexus-onboarding-done");
            if (onboarded !== "true") { setShowOnboarding(true); setOnboardingStep(0); }
        } catch { /* noop */ }
    }, []);

    const handleGoHome = useCallback(() => {
        setShowLanding(true);
        nexusSocket.disconnectWebSocket();
        nexusSocket.setAgentState("disconnected");
        stopRecording();
        stopVideoCapture();
    }, [wsRef, nexusSocket, stopRecording, stopVideoCapture]);

    const nextOnboardingStep = useCallback((dir: number = 1) => {
        setOnboardingStep((prev) => {
            const next = prev + dir;
            if (next >= 2) {
                setShowOnboarding(false);
                try { localStorage.setItem("nexus-onboarding-done", "true"); } catch { /* noop */ }
            }
            return Math.max(0, next);
        });
    }, []);

    const skipOnboarding = useCallback(() => {
        setShowOnboarding(false);
        try { localStorage.setItem("nexus-onboarding-done", "true"); } catch { /* noop */ }
    }, []);

    const loadSessionHistory = useCallback(async (sid: string) => {
        setIsLoadingHistory(true);
        try {
            const baseUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "");
            const res = await fetch(`${baseUrl}/api/session/${sid}/history`);
            if (!res.ok) throw new Error("Failed to load history");
            const data = await res.json();

            if (data.history && Array.isArray(data.history)) {
                const restoredMessages: ChatMessage[] = data.history.map((h: Record<string, unknown>) => {
                    let type: "text" | "image" | "tool" | "error" = "text";
                    if (h.image_data) type = "image";
                    else if (h.tool_name) type = "tool";

                    let toolResultObj;
                    if (h.tool_result) {
                        try { toolResultObj = JSON.parse(h.tool_result as string); } catch { /* noop */ }
                    }

                    return {
                        id: (h.timestamp as string) || String(Math.random()),
                        role: h.role === "system" ? "agent" : h.role,
                        type,
                        content: (h.content as string) || "",
                        imageData: h.image_data as string | undefined,
                        imageMime: h.mime as string | undefined,
                        toolName: h.tool_name as string | undefined,
                        toolResult: toolResultObj,
                        timestamp: new Date((h.timestamp as string) || Date.now()),
                    };
                });

                restoredMessages.sort((a: ChatMessage, b: ChatMessage) => a.timestamp.getTime() - b.timestamp.getTime());
                setMessages(restoredMessages);
                setIsSettingsOpen(false);
                addSystemMessage(`Loaded history containing ${restoredMessages.length} messages.`);
            }
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [setMessages, addSystemMessage]);

    const speakWithSubAgent = useCallback((text: string, specialty: string) => {
        if (typeof window === "undefined" || !window.speechSynthesis) return;

        // 1. Play "radio switch" beep
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch { /* noop */ }

        // 2. TTS with different voice
        let voices = window.speechSynthesis.getVoices();
        const ut = new SpeechSynthesisUtterance(text);
        
        const findVoice = () => {
            if (specialty === "code" || specialty === "data") {
                ut.voice = voices.find(v => (v.name.includes("Male") || v.name.includes("David") || v.name.includes("James")) && v.lang.startsWith("en")) || null;
            } else {
                ut.voice = voices.find(v => (v.name.includes("Female") || v.name.includes("Zira") || v.name.includes("Google US English") || v.name.includes("Google UK English Female")) && v.lang.startsWith("en")) || null;
            }
            ut.pitch = specialty === "code" ? 0.85 : 1.15;
            ut.rate = 1.05;
            window.speechSynthesis.speak(ut);
        };

        if (voices.length === 0) {
            window.speechSynthesis.onvoiceschanged = () => {
                voices = window.speechSynthesis.getVoices();
                findVoice();
                window.speechSynthesis.onvoiceschanged = null;
            };
        } else {
            findVoice();
        }
    }, []);

    const saveCustomAgent = useCallback(() => {
        if (!newAgent.name || !newAgent.description) return;
        const agent: CustomAgent = {
            id: `custom-${Date.now()}`,
            name: newAgent.name || "Custom Agent",
            emoji: newAgent.emoji || "🤖",
            description: newAgent.description || "",
            systemPrompt: newAgent.systemPrompt || "",
        };
        const updated = [...customAgents, agent];
        setCustomAgents(updated);
        try { localStorage.setItem("nexus-custom-agents", JSON.stringify(updated)); } catch { /* noop */ }
        setNewAgent({});
        setShowCreateModal(false);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "config", settings: { customAgent: agent } }));
        }
    }, [newAgent, customAgents, wsRef]);

    // =============================================
    //  RENDER — pure component composition
    // =============================================

    return (
        <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans antialiased overflow-hidden flex flex-col items-center">
            <div className={`app-container ${theme}`}>

                {/* Animated Background Orbs */}
                <div className="animated-background">
                    <div className="bg-shape shape-1"></div>
                    <div className="bg-shape shape-2"></div>
                    <div className="bg-shape shape-3"></div>
                </div>

                <main className="nexus-layout">
                    {/* Ambient gradients */}
                    <div className="ambient-glow ambient-glow-1" />
                    <div className="ambient-glow ambient-glow-2" />

                    {/* Dynamic Cursor Glow */}
                    <div
                        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
                        style={{
                            background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.04), transparent 40%)`
                        }}
                    />

                    <div className="advanced-bg-elements">
                        <div className="flowing-wave" />
                        <div className="flowing-wave-2" />
                    </div>

                    {/* Animated gradient mesh + constellation network */}
                    <div className="animated-bg">
                        <div className="blob-3" />
                        <div className="particles">
                            {[...Array(8)].map((_, i) => (
                                <div key={`p-${i}`} className="particle" />
                            ))}
                        </div>
                        <canvas ref={constellationRef} className="constellation-canvas" />
                        <div className="scanlines" />
                        <div className="pulse-rings">
                            {[...Array(4)].map((_, i) => (
                                <div key={`ring-${i}`} className="pulse-ring" />
                            ))}
                        </div>
                    </div>

                    {/* ---- LANDING PAGE ---- */}
                    {showLanding && (
                        <LandingPage
                            mousePos={mousePos}
                            onDismiss={dismissLanding}
                            themeHook={themeHook}
                        />
                    )}

                    {/* ---- MAIN APP ---- */}
                    {!showLanding && (
                        <div className="nexus-panel">
                            <AppHeader
                                isConnected={isConnected}
                                agentState={agentState}
                                sessionId={sessionId}
                                sessionElapsed={sessionElapsed}
                                mode={mode}
                                isRecording={isRecording}
                                isHandsFree={isHandsFree}
                                themeHook={themeHook}
                                onGoHome={handleGoHome}
                                onConnect={connectWebSocket}
                                onToggleRecording={toggleRecording}
                                onToggleHandsFree={() => setIsHandsFree(prev => !prev)}
                                onOpenSettings={() => setIsSettingsOpen(true)}
                                onShowGuide={() => { setShowOnboarding(true); setOnboardingStep(0); }}
                            />

                            {!isConnected ? (
                                <ModeHub
                                    mode={mode}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    customAgents={customAgents}
                                    showOnboarding={showOnboarding}
                                    onboardingStep={onboardingStep}
                                    onSelectMode={setMode}
                                    onConnect={connectWebSocket}
                                    onNextOnboardingStep={() => nextOnboardingStep(1)}
                                    onCreateAgent={() => setShowCreateModal(true)}
                                />
                            ) : (
                                <ChatWorkspace
                                    mode={mode}
                                    agentState={agentState}
                                    messages={messages}
                                    textInput={textInput}
                                    isConnected={isConnected}
                                    isRecording={isRecording}
                                    isCameraOn={isCameraOn}
                                    isScreenSharing={isScreenSharing}
                                    canvasRef={canvasRef}
                                    messagesEndRef={messagesEndRef}
                                    wsRef={wsRef}
                                    outputAnalyserRef={outputAnalyserRef}
                                    micAnalyserRef={analyserRef}
                                    onSwitchMode={switchMode}
                                    onSetTextInput={setTextInput}
                                    onSendText={sendTextMessage}
                                    onInterrupt={sendInterrupt}
                                    onToggleRecording={toggleRecording}
                                    onToggleCamera={toggleCamera}
                                    onToggleScreenShare={toggleScreenShare}
                                    addMessage={addMessage}
                                />
                            )}
                        </div>
                    )}

                    {/* Video preview overlay */}
                    {(isCameraOn || isScreenSharing) && (
                        <VideoPreview
                            videoRef={videoRef}
                            boundingBoxes={boundingBoxes}
                            currentGesture={currentGesture}
                        />
                    )}

                    {/* Settings modal */}
                    {isSettingsOpen && (
                        <SettingsModal
                            sessionId={sessionId}
                            mode={mode}
                            isConnected={isConnected}
                            theme={theme}
                            persona={persona}
                            userFacts={userFacts}
                            pastSessions={pastSessions}
                            isLoadingHistory={isLoadingHistory}
                            onClose={() => setIsSettingsOpen(false)}
                            onPersonaChange={setPersona}
                            onLoadHistory={loadSessionHistory}
                        />
                    )}

                    {/* Create Agent modal */}
                    {showCreateModal && (
                        <CreateAgentModal
                            newAgent={newAgent}
                            onUpdate={(update) => setNewAgent(prev => ({ ...prev, ...update }))}
                            onSave={saveCustomAgent}
                            onClose={() => setShowCreateModal(false)}
                        />
                    )}

                    {/* Onboarding tutorial overlay */}
                    {showOnboarding && !showLanding && !isConnected && (
                        <OnboardingOverlay
                            step={onboardingStep}
                            highlightedMode={highlightedMode}
                            modeInfo={MODE_INFO}
                            onNext={nextOnboardingStep}
                            onSkip={skipOnboarding}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}
