/**
 * useAudioEngine.ts — Professional audio processing for Gemini Live API
 * 
 * CRITICAL FIXES:
 * - Two separate AudioContexts: 16kHz for input, 24kHz for output
 * - Proper Int16 → Float32 conversion (divide by 32768.0)
 * - Dynamics compressor to prevent clipping and harshness
 * - De-clicking: Linear fade-in/out at boundaries
 * - Robust flushing: Closes context to kill zombie nodes on barge-in
 */

import { useRef, useCallback } from "react";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;

export interface AudioQueueItem {
    type: "audio" | "image";
    data: string;
    mime?: string;
}

export interface AudioEngineAPI {
    audioQueueRef: React.MutableRefObject<AudioQueueItem[]>;
    isPlayingRef: React.MutableRefObject<boolean>;
    playbackCtxRef: React.MutableRefObject<AudioContext | null>;
    captureCtxRef: React.MutableRefObject<AudioContext | null>;
    outputAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
    handleAudioResponse: (base64Audio: string) => void;
    playNextChunk: (onImage?: (data: string, mime: string) => void) => void;
    flushAudio: () => void;
}

export function useAudioEngine(): AudioEngineAPI {
    const audioQueueRef = useRef<AudioQueueItem[]>([]);
    const isPlayingRef = useRef(false);
    
    // Two separate contexts for input and output to avoid resampling artifacts
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const captureCtxRef = useRef<AudioContext | null>(null);
    
    const outputAnalyserRef = useRef<AnalyserNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const compressorRef = useRef<DynamicsCompressorNode | null>(null);
    const nextPlayTimeRef = useRef(0);

    const initPlaybackContext = useCallback(() => {
        if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: OUTPUT_SAMPLE_RATE,
                latencyHint: "interactive"
            });
            playbackCtxRef.current = ctx;

            // Compressor: Makes the audio "premium", smooths out spikes
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            
            // Gain: For normalization
            const gain = ctx.createGain();
            gain.gain.value = 1.0;
            gainNodeRef.current = gain;

            // Analyser: For the visualizer
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            outputAnalyserRef.current = analyser;

            // Chain: source -> compressor -> gain -> analyser -> destination
            compressor.connect(gain);
            gain.connect(analyser);
            analyser.connect(ctx.destination);
            compressorRef.current = compressor;
            
            nextPlayTimeRef.current = 0;
            console.log(`[AudioEngine] Playback context initialized at ${OUTPUT_SAMPLE_RATE}Hz`);
        }
        return playbackCtxRef.current;
    }, []);

    const convertInt16ToFloat32 = useCallback((pcmData: ArrayBuffer): Float32Array => {
        const dataView = new DataView(pcmData);
        const floatArray = new Float32Array(pcmData.byteLength / 2);
        for (let i = 0; i < floatArray.length; i++) {
            floatArray[i] = dataView.getInt16(i * 2, true) / 32768.0;
        }
        return floatArray;
    }, []);

    const handleAudioResponse = useCallback((base64Audio: string) => {
        audioQueueRef.current.push({ type: "audio", data: base64Audio });
        if (!isPlayingRef.current) {
            isPlayingRef.current = true;
            // Ensure context is ready
            initPlaybackContext();
            requestAnimationFrame(() => playNextChunk());
        }
    }, [initPlaybackContext]);

    const playNextChunk = useCallback((onImage?: (data: string, mime: string) => void) => {
        const ctx = playbackCtxRef.current || initPlaybackContext();
        if (audioQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            return;
        }

        if (ctx.state === "suspended") {
            ctx.resume();
        }

        const chunk = audioQueueRef.current.shift();
        if (!chunk) { isPlayingRef.current = false; return; }

        // Decode base64
        const binaryString = atob(chunk.data);
        const pcmBuffer = new ArrayBuffer(binaryString.length);
        const pcmView = new Uint8Array(pcmBuffer);
        for (let i = 0; i < binaryString.length; i++) {
            pcmView[i] = binaryString.charCodeAt(i);
        }

        const floatData = convertInt16ToFloat32(pcmBuffer);
        const audioBuffer = ctx.createBuffer(NUM_CHANNELS, floatData.length, OUTPUT_SAMPLE_RATE);
        const channelData = audioBuffer.getChannelData(0);
        channelData.set(floatData);

        // --- De-clicking: Linear fade-in/out ---
        const fadeLength = Math.floor(OUTPUT_SAMPLE_RATE * 0.005); 
        if (channelData.length > fadeLength * 2) {
            for (let i = 0; i < fadeLength; i++) {
                channelData[i] *= (i / fadeLength);
                channelData[channelData.length - 1 - i] *= (i / fadeLength);
            }
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Connect to the chain (compressor is our entry point)
        if (compressorRef.current) {
            source.connect(compressorRef.current);
        } else {
            source.connect(ctx.destination);
        }

        const currentTime = ctx.currentTime;
        const startTime = Math.max(currentTime, nextPlayTimeRef.current);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;

        source.onended = () => playNextChunk(onImage);
    }, [convertInt16ToFloat32, initPlaybackContext]);

    const flushAudio = useCallback(() => {
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        nextPlayTimeRef.current = 0;

        // CRITICAL: close() kills zombie nodes. resume/suspend DOES NOT.
        if (playbackCtxRef.current) {
            try {
                playbackCtxRef.current.close().catch(() => {});
            } catch (e) {
                console.error("Flush error", e);
            }
            playbackCtxRef.current = null;
            compressorRef.current = null;
            outputAnalyserRef.current = null;
            gainNodeRef.current = null;
        }
    }, []);

    return {
        audioQueueRef,
        isPlayingRef,
        playbackCtxRef,
        captureCtxRef,
        outputAnalyserRef,
        handleAudioResponse,
        playNextChunk,
        flushAudio,
    };
}
