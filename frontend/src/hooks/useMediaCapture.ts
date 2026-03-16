"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AudioQueueItem } from "./useAudioEngine";

export interface UseMediaCaptureReturn {
    isRecording: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    analyserRef: React.MutableRefObject<AnalyserNode | null>;
    toggleRecording: () => Promise<void>;
    stopRecording: () => void;
    toggleCamera: () => Promise<void>;
    toggleScreenShare: () => Promise<void>;
    stopVideoCapture: () => void;
    startVisualizer: () => void;
}

/**
 * useMediaCapture — owns microphone recording (PCM 16kHz),
 * camera/screen-share capture, video frame encoding, the audio
 * input visualizer, and voice activity detection (whisper +
 * aggressive barge-in).
 *
 * This hook talks to the WebSocket via the `wsRef` and
 * `sendInterrupt` references passed in from useNexusSocket.
 */
export function useMediaCapture(
    wsRef: React.MutableRefObject<WebSocket | null>,
    sendInterrupt: () => void,
    addSystemMessage: (content: string) => void,
    isPlayingRef: React.MutableRefObject<boolean>,
    audioQueueRef: React.MutableRefObject<AudioQueueItem[]>,
    mode: string,
    processGestures: ((landmarks: any[]) => void) | null,
    handLandmarkerRef: React.MutableRefObject<any | null>,
): UseMediaCaptureReturn {
    const [isRecording, setIsRecording] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const animationRef = useRef<number>(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);

    const videoStreamRef = useRef<MediaStream | null>(null);
    const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const videoCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Whisper + VAD refs
    const whisperFramesRef = useRef(0);
    const loudFramesRef = useRef(0);
    const bargeInFramesRef = useRef(0);
    const isWhisperingRef = useRef(false);
    const lastWhisperConfigRef = useRef(0);

    // Gesture loop
    const gestureLoopRef = useRef<number>(0);

    // ---- Microphone recording ----
    const stopRecording = useCallback(() => {
        if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
        if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
        if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setIsRecording(false);
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) { stopRecording(); return; }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
            mediaStreamRef.current = stream;
            const audioCtx = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            source.connect(analyser);

            try {
                await audioCtx.audioWorklet.addModule("/pcm-processor.js");
                const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
                workletNodeRef.current = workletNode;

                workletNode.port.onmessage = (event: MessageEvent) => {
                    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                    const pcmBuffer: ArrayBuffer = event.data;
                    const bytes = new Uint8Array(pcmBuffer);
                    let binary = "";
                    for (let i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
                    const b64 = btoa(binary);
                    wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
                };

                source.connect(workletNode);
                workletNode.connect(audioCtx.destination);
            } catch {
                const processor = audioCtx.createScriptProcessor(4096, 1, 1);
                processor.onaudioprocess = (e: AudioProcessingEvent) => {
                    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputData[i]));
                        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                    }
                    const bytes = new Uint8Array(pcmData.buffer);
                    let binary = "";
                    for (let i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
                    const b64 = btoa(binary);
                    wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
                };
                source.connect(processor);
                processor.connect(audioCtx.destination);
            }

            setIsRecording(true);
        } catch (err) {
            console.error("Microphone access denied:", err);
            addSystemMessage("⚠️ Microphone access denied. Please allow mic access.");
        }
    }, [isRecording, stopRecording, wsRef, addSystemMessage]);

    // ---- Video capture ----
    const stopVideoCapture = useCallback(() => {
        if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }
        if (gestureLoopRef.current) cancelAnimationFrame(gestureLoopRef.current);
        if (videoStreamRef.current) { videoStreamRef.current.getTracks().forEach((t) => t.stop()); videoStreamRef.current = null; }
        if (videoRef.current) videoRef.current.srcObject = null;
        videoCaptureCanvasRef.current = null;
        setIsCameraOn(false);
        setIsScreenSharing(false);
    }, []);

    const startVideoCapture = useCallback((stream: MediaStream) => {
        videoStreamRef.current = stream;

        // FIX: Wait for React to render <VideoPreview> before attaching stream.
        // Without this delay, videoRef.current is null because the <video> element
        // only appears in the DOM after setIsCameraOn(true) triggers a re-render.
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.error("Video play error:", e));
            }
        }, 50);

        const captureCanvas = document.createElement("canvas");
        captureCanvas.width = 1280;
        captureCanvas.height = 720;
        videoCaptureCanvasRef.current = captureCanvas;

        // Jedi Mode (MediaPipe) gesture detection loop
        let lastVideoTime = -1;
        const gestureLoop = () => {
            if (!videoRef.current || !videoStreamRef.current) return;

            if (handLandmarkerRef.current && videoRef.current.currentTime !== lastVideoTime) {
                lastVideoTime = videoRef.current.currentTime;
                try {
                    const results = handLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
                    if (results.landmarks && results.landmarks.length > 0 && processGestures) {
                        processGestures(results.landmarks[0]);
                    }
                } catch { } // ignore detection errors during startup/shutdown
            }
            gestureLoopRef.current = requestAnimationFrame(gestureLoop);
        };
        gestureLoopRef.current = requestAnimationFrame(gestureLoop);

        // Dynamic framerate based on mode — must match the backend VideoProcessor
        // Navigator/Security = 15fps (67ms), Code = 5fps (200ms), Creative = 2fps (500ms)
        const framerateMap: Record<string, number> = {
            navigator: 67,
            security: 67,
            code: 200,
            creative: 500,
            data: 200,
        };
        const framerateInterval = framerateMap[mode] || 200;

        videoIntervalRef.current = setInterval(() => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            if (!videoRef.current || !videoCaptureCanvasRef.current) return;

            try {
                const video = videoRef.current;
                const canvas = videoCaptureCanvasRef.current;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const vw = video.videoWidth || 1280;
                const vh = video.videoHeight || 720;
                const ratio = Math.min(768 / vw, 768 / vh);
                const drawW = Math.round(vw * ratio);
                const drawH = Math.round(vh * ratio);
                canvas.width = drawW;
                canvas.height = drawH;

                ctx.drawImage(video, 0, 0, drawW, drawH);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                const base64 = dataUrl.split(",")[1];
                if (base64) {
                    wsRef.current.send(JSON.stringify({ type: "video", data: base64 }));
                }
            } catch (err) {
                // Swallow single-frame errors — canvas CORS / video not ready yet.
                // Don't spam console — only log every ~30 failures.
                if (Math.random() < 0.03) {
                    console.warn("[NEXUS] Video frame capture error (non-fatal):", err);
                }
            }
        }, framerateInterval);
    }, [wsRef, mode, processGestures, handLandmarkerRef]);

    const toggleCamera = useCallback(async () => {
        if (isCameraOn) { stopVideoCapture(); return; }
        try {
            const isHighFpsMode = mode === "navigator" || mode === "security";
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: isHighFpsMode ? 1280 : 1280 },
                    height: { ideal: isHighFpsMode ? 720 : 720 },
                    frameRate: { ideal: isHighFpsMode ? 15 : 5, max: isHighFpsMode ? 30 : 10 },
                },
            });
            // FIX: Set state FIRST so React renders <VideoPreview>,
            // THEN attach the stream (startVideoCapture has a 50ms delay)
            setIsCameraOn(true);
            startVideoCapture(stream);
        } catch (err) {
            console.error("Camera access denied:", err);
            addSystemMessage("⚠️ Camera access denied.");
        }
    }, [isCameraOn, stopVideoCapture, startVideoCapture, addSystemMessage, mode]);

    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) { stopVideoCapture(); return; }
        try {
            const isHighFpsScreen = mode === "navigator" || mode === "security";
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: isHighFpsScreen ? 10 : 2, max: isHighFpsScreen ? 15 : 5 },
                },
            });
            stream.getVideoTracks()[0].addEventListener("ended", () => stopVideoCapture());
            // FIX: Set state FIRST so React renders <VideoPreview>,
            // THEN attach the stream (startVideoCapture has a 50ms delay)
            setIsScreenSharing(true);
            startVideoCapture(stream);
        } catch (err) {
            console.error("Screen share denied:", err);
            addSystemMessage("⚠️ Screen share denied or cancelled.");
        }
    }, [isScreenSharing, stopVideoCapture, startVideoCapture, addSystemMessage, mode]);

    // ---- Audio input visualizer with VAD ----
    const startVisualizer = useCallback(() => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const analyser = analyserRef.current;
        if (!ctx) return;

        const bufLen = analyser.frequencyBinCount;
        const dataArr = new Uint8Array(bufLen);
        const googleColors = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArr);

            // --- VAD: Energy calculation ---
            let sumEnergy = 0;
            for (let i = 0; i < bufLen; i++) sumEnergy += dataArr[i];
            const avgEnergy = sumEnergy / bufLen;

            if (avgEnergy > 3 && avgEnergy < 15) {
                whisperFramesRef.current++;
                loudFramesRef.current = 0;
            } else if (avgEnergy >= 15) {
                loudFramesRef.current++;
                whisperFramesRef.current = 0;
            } else {
                whisperFramesRef.current = 0;
                loudFramesRef.current = 0;
                bargeInFramesRef.current = 0;
            }

            // --- IMPROVED VAD: Faster barge-in (6 frames ≈ 100ms) ---
            if (isPlayingRef.current && avgEnergy > 20) {
                bargeInFramesRef.current++;
                if (bargeInFramesRef.current > 6) {
                    console.log("[NEXUS] Aggressive Barge-in triggered by user voice!");
                    sendInterrupt();
                    bargeInFramesRef.current = 0;
                }
            } else {
                bargeInFramesRef.current = 0;
            }

            // Whisper detection
            const now = Date.now();
            if (whisperFramesRef.current > 30 && !isWhisperingRef.current && (now - lastWhisperConfigRef.current > 3000)) {
                isWhisperingRef.current = true;
                lastWhisperConfigRef.current = now;
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: "config", settings: { whisper: true } }));
                    wsRef.current.send(JSON.stringify({ type: "text", content: "[SYSTEM] User is whispering. Lower your voice and reply in a whisper." }));
                }
            } else if (loudFramesRef.current > 20 && isWhisperingRef.current && (now - lastWhisperConfigRef.current > 3000)) {
                isWhisperingRef.current = false;
                lastWhisperConfigRef.current = now;
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: "config", settings: { whisper: false } }));
                }
            }

            // Draw frequency bars
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const barW = (canvas.width / bufLen) * 2.5;
            let x = 0;
            for (let i = 0; i < bufLen; i++) {
                const barH = (dataArr[i] / 255) * canvas.height * 0.85;
                ctx.fillStyle = googleColors[i % 4];
                ctx.globalAlpha = 0.7 + (dataArr[i] / 255) * 0.3;
                const radius = Math.min(barW / 2, 3);
                const y = canvas.height - barH;
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + barW - radius, y);
                ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
                ctx.lineTo(x + barW, canvas.height);
                ctx.lineTo(x, canvas.height);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.fill();
                x += barW + 1;
            }
            ctx.globalAlpha = 1;

            // Dynamic breathing + mode styling
            if (canvas.parentElement) {
                const energy = Math.min(avgEnergy / 100, 1.0);
                const activeMode = canvas.dataset.mode || "live";
                let rgb = "66, 133, 244";
                if (activeMode === "creative") rgb = "234, 67, 53";
                else if (activeMode === "navigator") rgb = "52, 168, 83";
                else if (activeMode === "research") rgb = "251, 188, 5";

                canvas.parentElement.style.boxShadow = `0 4px 24px rgba(${rgb}, ${0.1 + energy * 0.5})`;
                canvas.parentElement.style.borderColor = `rgba(${rgb}, ${0.2 + energy * 0.6})`;
                canvas.style.transform = `scale(${1 + energy * 0.05})`;
                canvas.style.opacity = `${0.7 + energy * 0.3}`;
            }
        };
        draw();
    }, [sendInterrupt, isPlayingRef, wsRef]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
            stopVideoCapture();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        isRecording,
        isCameraOn,
        isScreenSharing,
        canvasRef,
        videoRef,
        analyserRef,
        toggleRecording,
        stopRecording,
        toggleCamera,
        toggleScreenShare,
        stopVideoCapture,
        startVisualizer,
    };
}
