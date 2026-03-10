"use client";

import { useRef, useEffect, useCallback } from "react";
import type { AgentState, AgentMode } from "@/hooks";

/**
 * AudioVisualizer — premium organic waveform that reacts to the agent's
 * audio output and state transitions.
 *
 * Rendering modes:
 *   - idle/listening → calm breathing pulse with ambient glow
 *   - speaking       → energetic radial waveform driven by AnalyserNode data
 *   - thinking       → subtle rotating ring with particle shimmer
 *
 * Uses Canvas 2D for maximum compatibility. The waveform is drawn as a
 * circular radial bar graph with smooth easing, Google brand color gradients,
 * and glassmorphism glow effects that match the NEXUS design system.
 */

interface AudioVisualizerProps {
    /** AnalyserNode from useAudioEngine — reads frequency data from agent output */
    analyserRef: React.MutableRefObject<AnalyserNode | null>;
    /** AnalyserNode from useMediaCapture — reads mic input frequency data */
    micAnalyserRef?: React.MutableRefObject<AnalyserNode | null>;
    /** Current agent behaviour state */
    agentState: AgentState;
    /** Current agent mode — color palette shifts per mode */
    mode: AgentMode;
    /** Whether the user's mic is actively capturing */
    isRecording: boolean;
}

// Google brand palette — used for the waveform gradient
const COLORS = {
    blue: "#4285F4",
    red: "#EA4335",
    yellow: "#FBBC05",
    green: "#34A853",
};

// Mode-specific accent — gives each mode its own visual signature
const MODE_ACCENTS: Record<string, string[]> = {
    live: [COLORS.blue, COLORS.green, COLORS.blue],
    creative: [COLORS.red, COLORS.yellow, "#ff6b9d"],
    navigator: [COLORS.blue, "#40e0d0", COLORS.green],
    code: [COLORS.green, COLORS.blue, "#6bffb8"],
    research: [COLORS.yellow, COLORS.blue, COLORS.green],
    language: ["#8a64ff", COLORS.blue, "#ff6b9d"],
    data: [COLORS.blue, COLORS.yellow, COLORS.green],
    music: [COLORS.red, "#8a64ff", COLORS.yellow],
    game: [COLORS.red, COLORS.yellow, COLORS.green],
    meeting: [COLORS.blue, COLORS.green, COLORS.yellow],
    security: [COLORS.red, "#ff6b9d", COLORS.yellow],
};

export function AudioVisualizer({
    analyserRef,
    micAnalyserRef,
    agentState,
    mode,
    isRecording,
}: AudioVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const phaseRef = useRef(0);
    const breathRef = useRef(0);

    /**
     * Main render loop — runs at 60fps via requestAnimationFrame.
     *
     * The visualizer picks the right "personality" based on agentState:
     * breathing pulse when idle, frequency-driven waveform when speaking,
     * spinning ring when thinking.
     */
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Handle DPR for crisp rendering on Retina displays
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = rect.height;
        const cx = W / 2;
        const cy = H / 2;

        ctx.clearRect(0, 0, W, H);

        const accents = MODE_ACCENTS[mode] || MODE_ACCENTS.live;
        phaseRef.current += 0.015;
        breathRef.current += 0.02;

        // Get frequency data from the agent's audio output if available
        let freqData: Uint8Array | null = null;
        if (analyserRef.current) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const buf = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
            freqData = buf;
        }

        // Get mic input frequency data if available
        let micData: Uint8Array | null = null;
        if (micAnalyserRef?.current) {
            const micBufferLength = micAnalyserRef.current.frequencyBinCount;
            const micBuf = new Uint8Array(micBufferLength);
            micAnalyserRef.current.getByteFrequencyData(micBuf as unknown as Uint8Array<ArrayBuffer>);
            micData = micBuf;
        }

        // Compute average energy from frequency data to drive visual intensity
        const computeEnergy = (data: Uint8Array | null): number => {
            if (!data) return 0;
            let sum = 0;
            const len = Math.min(data.length, 128);
            for (let i = 0; i < len; i++) sum += data[i];
            return sum / (len * 255);
        };

        const outputEnergy = computeEnergy(freqData);
        const micEnergy = computeEnergy(micData);

        const isSpeaking = agentState === "speaking" || outputEnergy > 0.08;
        const isThinking = agentState === "thinking";
        const isListening = isRecording && !isSpeaking;

        // Base radius for the visualizer circle
        const baseRadius = Math.min(W, H) * 0.28;
        const breathScale = 1 + Math.sin(breathRef.current) * 0.03;

        // --- Ambient glow behind the visualizer ---
        const glowRadius = baseRadius * 1.8;
        const glowGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, glowRadius);
        const glowAlpha = isSpeaking ? 0.12 + outputEnergy * 0.15 : isListening ? 0.06 + micEnergy * 0.1 : 0.04;
        glowGrad.addColorStop(0, `${accents[0]}${Math.round(glowAlpha * 255).toString(16).padStart(2, "0")}`);
        glowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, W, H);

        // --- Draw the radial waveform bars ---
        const BAR_COUNT = 64;
        const BAR_WIDTH = 2.5;

        for (let i = 0; i < BAR_COUNT; i++) {
            const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
            const colorIdx = Math.floor((i / BAR_COUNT) * accents.length) % accents.length;

            let barHeight: number;

            if (isSpeaking && freqData) {
                // Map frequency bin to bar — logarithmic distribution for
                // better visual weight on the lower frequencies (voice range)
                const freqIdx = Math.floor((i / BAR_COUNT) * Math.min(freqData.length, 128));
                const val = freqData[freqIdx] / 255;
                barHeight = baseRadius * 0.15 + val * baseRadius * 0.55;
            } else if (isListening && micData) {
                const freqIdx = Math.floor((i / BAR_COUNT) * Math.min(micData.length, 128));
                const val = micData[freqIdx] / 255;
                barHeight = baseRadius * 0.08 + val * baseRadius * 0.35;
            } else if (isThinking) {
                // Subtle rotating sine wave during thinking
                const wave = Math.sin(phaseRef.current * 3 + i * 0.2) * 0.5 + 0.5;
                barHeight = baseRadius * 0.05 + wave * baseRadius * 0.12;
            } else {
                // Calm breathing pulse when idle
                const wave = Math.sin(breathRef.current + i * 0.15) * 0.5 + 0.5;
                barHeight = baseRadius * 0.03 + wave * baseRadius * 0.06;
            }

            const innerR = baseRadius * breathScale;
            const outerR = innerR + barHeight;

            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            // Gradient along each bar for that premium look
            const barGrad = ctx.createLinearGradient(x1, y1, x2, y2);
            const baseAlpha = isSpeaking ? 0.7 + outputEnergy * 0.3 : isListening ? 0.5 + micEnergy * 0.3 : 0.25;
            barGrad.addColorStop(0, `${accents[colorIdx]}${Math.round(baseAlpha * 0.4 * 255).toString(16).padStart(2, "0")}`);
            barGrad.addColorStop(1, `${accents[colorIdx]}${Math.round(baseAlpha * 255).toString(16).padStart(2, "0")}`);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = barGrad;
            ctx.lineWidth = BAR_WIDTH;
            ctx.lineCap = "round";
            ctx.stroke();
        }

        // --- Inner ring (subtle border) ---
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * breathScale * 0.95, 0, Math.PI * 2);
        const ringAlpha = isSpeaking ? 0.3 : 0.12;
        ctx.strokeStyle = `${accents[0]}${Math.round(ringAlpha * 255).toString(16).padStart(2, "0")}`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // --- State indicator dot in the center ---
        const dotRadius = 4;
        const dotPulse = Math.sin(phaseRef.current * 4) * 0.5 + 0.5;
        const dotColor = isSpeaking ? accents[0] : isThinking ? COLORS.yellow : isListening ? COLORS.green : accents[0];
        const dotAlpha = 0.4 + dotPulse * 0.6;

        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius + (isSpeaking ? dotPulse * 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = `${dotColor}${Math.round(dotAlpha * 255).toString(16).padStart(2, "0")}`;
        ctx.fill();

        // --- State label text ---
        const stateLabel = isSpeaking ? "SPEAKING" : isThinking ? "THINKING" : isListening ? "LISTENING" : "READY";
        ctx.font = "600 9px 'Google Sans', 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `${accents[0]}80`;
        ctx.fillText(stateLabel, cx, cy + baseRadius * breathScale + 20);

        animFrameRef.current = requestAnimationFrame(draw);
    }, [analyserRef, micAnalyserRef, agentState, mode, isRecording]);

    useEffect(() => {
        animFrameRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);

    return (
        <div className="nexus-visualizer-container">
            <canvas
                ref={canvasRef}
                className="nexus-visualizer-canvas"
                style={{
                    width: "100%",
                    height: "100%",
                }}
            />
        </div>
    );
}
