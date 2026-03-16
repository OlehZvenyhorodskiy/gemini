"use client";

import { useRef, useCallback } from "react";

/**
 * Gemini Live API outputs 24kHz PCM audio — this sample rate must
 * match on both the decode and playback side or you get chipmunk voices.
 */
const PLAYBACK_SAMPLE_RATE = 24000;



export type AudioQueueItem =
    | { type: "audio"; buffer: ArrayBuffer }
    | { type: "image"; data: string; mime: string };

export interface UseAudioEngineReturn {
    /** The playback queue — other hooks push items here */
    audioQueueRef: React.MutableRefObject<AudioQueueItem[]>;
    isPlayingRef: React.MutableRefObject<boolean>;
    playbackCtxRef: React.MutableRefObject<AudioContext | null>;
    nextPlayTimeRef: React.MutableRefObject<number>;

    /**
     * AnalyserNode wired into the playback graph — the AudioVisualizer
     * reads frequency data from this to render the organic waveform.
     * null until the first audio chunk triggers AudioContext creation.
     */
    outputAnalyserRef: React.MutableRefObject<AnalyserNode | null>;

    /** Decode base64 PCM and push onto the queue */
    handleAudioResponse: (audioB64: string) => void;

    /** Drain + play the queue chunk by chunk (gapless) */
    playNextChunk: (onImage: (data: string, mime: string) => void) => void;

    /**
     * Improved barge-in — suspends the AudioContext FIRST for
     * instant silence, then closes + recreates it. Also empties
     * the queue and resets the play-head.
     */
    flushAudio: () => void;
}

/**
 * useAudioEngine — manages the Web Audio playback pipeline:
 *   - base64 PCM → Int16 → Float32 → AudioBuffer scheduling
 *   - gapless chunk chaining via `source.onended`
 *   - crossfade between chunks to eliminate boundary clicks
 *   - gain normalization to reduce hissing/clipping
 *   - instant barge-in via suspend() → close() → recreate
 *   - AnalyserNode exposed for the AudioVisualizer component
 */
export function useAudioEngine(): UseAudioEngineReturn {
    const audioQueueRef = useRef<AudioQueueItem[]>([]);
    const isPlayingRef = useRef(false);
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const nextPlayTimeRef = useRef(0);
    const outputAnalyserRef = useRef<AnalyserNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);

    /**
     * Lazily creates the AudioContext, GainNode, and AnalyserNode on first use.
     * Audio graph: source → gain → analyser → destination
     * The gain node normalizes levels, the analyser feeds the visualizer.
     */
    const ensureContext = useCallback(() => {
        if (!playbackCtxRef.current) {
            const ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
            playbackCtxRef.current = ctx;

            // Gain node — keep at 1.0 to avoid clipping/hissing.
            // A value above 1.0 amplifies the already-normalized PCM and causes distortion.
            const gain = ctx.createGain();
            gain.gain.value = 1.0;
            gainNodeRef.current = gain;

            // Analyser for the visualizer — 2048 FFT gives
            // 1024 frequency bins, enough for a smooth organic waveform
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.92; // Very smooth to avoid jitter
            
            // Wire: gain → analyser → destination
            gain.connect(analyser);
            analyser.connect(ctx.destination);
            outputAnalyserRef.current = analyser;
        }
        return playbackCtxRef.current;
    }, []);



    /**
     * Decode base64 PCM audio chunk and queue for playback.
     * Kicks off the drain loop if nothing's playing yet.
     */
    const handleAudioResponse = useCallback((audioB64: string) => {
        try {
            const binaryStr = atob(audioB64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            audioQueueRef.current.push({ type: "audio", buffer: bytes.buffer });
            if (!isPlayingRef.current) {
                isPlayingRef.current = true;
                requestAnimationFrame(() => playNextChunkInternal(undefined as never));
            }
        } catch (err) {
            console.error("Audio decode error:", err);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Internal chunk player — shared between the public API and
     * the `source.onended` callback.
     *
     * Routes audio through GainNode → AnalyserNode so the visualizer
     * can pick up frequency data from the agent's voice output.
     * Applies crossfade between chunks for smooth audio.
     */
    const playNextChunkInternal = useCallback(
        (onImage: (data: string, mime: string) => void) => {
            if (audioQueueRef.current.length === 0) {
                isPlayingRef.current = false;
                return;
            }

            const ctx = ensureContext();
            const item = audioQueueRef.current.shift();
            if (!item) { isPlayingRef.current = false; return; }

            if (item.type === "image") {
                onImage(item.data, item.mime);
                requestAnimationFrame(() => playNextChunkInternal(onImage));
                return;
            }

            const int16Data = new Int16Array(item.buffer);
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            const audioBuffer = ctx.createBuffer(1, float32Data.length, PLAYBACK_SAMPLE_RATE);
            const channelData = audioBuffer.getChannelData(0);
            channelData.set(float32Data);

            // --- De-clicking: Linear fade-in/out at boundaries ---
            // 5ms fade is enough to kill the "pop" without losing audible speech bits
            const fadeLength = Math.floor(PLAYBACK_SAMPLE_RATE * 0.005); 
            if (channelData.length > fadeLength * 2) {
                for (let i = 0; i < fadeLength; i++) {
                    channelData[i] *= (i / fadeLength); // Fade in
                    channelData[channelData.length - 1 - i] *= (i / fadeLength); // Fade out
                }
            }

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            // Route through gain → analyser chain
            if (gainNodeRef.current) {
                source.connect(gainNodeRef.current);
            } else if (outputAnalyserRef.current) {
                source.connect(outputAnalyserRef.current);
            } else {
                source.connect(ctx.destination);
            }

            const currentTime = ctx.currentTime;
            const startTime = Math.max(currentTime, nextPlayTimeRef.current);
            source.start(startTime);
            nextPlayTimeRef.current = startTime + audioBuffer.duration;

            source.onended = () => playNextChunkInternal(onImage);
        },
        [ensureContext]
    );

    /**
     * Public wrapper — lets the component inject an `onImage` callback
     * that knows how to `addMessage`.
     */
    const playNextChunk = useCallback(
        (onImage: (data: string, mime: string) => void) => {
            playNextChunkInternal(onImage);
        },
        [playNextChunkInternal]
    );

    /**
     * Improved barge-in flush — achieves sub-frame silence:
     *   1. Empty the queue so no NEW chunks get scheduled
     *   2. Suspend the running AudioContext (stops mid-buffer playback instantly)
     *   3. Close the old context + create a fresh one for the next response
     *   4. Reset the play-head, crossfade state, and analyser
     */
    const flushAudio = useCallback(() => {
        // 1. Очищаємо чергу — нові чанки не грають
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        nextPlayTimeRef.current = 0;

        // 2. ЗАКРИВАЄМО контекст повністю — це знищує всі заплановані вузли
        if (playbackCtxRef.current) {
            try {
                playbackCtxRef.current.close(); // <- close() а не suspend/resume!
            } catch (e) {
                console.error("Failed to close AudioContext on barge-in", e);
            }
            // 3. Обнуляємо всі refs — ensureContext створить нові при наступному аудіо
            playbackCtxRef.current = null;
            gainNodeRef.current = null;
            outputAnalyserRef.current = null;
        }
    }, []);

    return {
        audioQueueRef,
        isPlayingRef,
        playbackCtxRef,
        nextPlayTimeRef,
        outputAnalyserRef,
        handleAudioResponse,
        playNextChunk,
        flushAudio,
    };
}
