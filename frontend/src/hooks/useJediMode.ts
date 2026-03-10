"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface UseJediModeReturn {
    handLandmarkerRef: React.MutableRefObject<HandLandmarker | null>;
    currentGesture: string | null;
    setCurrentGesture: React.Dispatch<React.SetStateAction<string | null>>;
    processGestures: (landmarks: any[]) => void;
}

/**
 * useJediMode — encapsulates MediaPipe hand-landmark initialization
 * and the gesture detection loop (pinch → toggle hands-free,
 * open palm → stop microphone).
 *
 * The heavy MediaPipe WASM loads once on mount and the
 * handLandmarkerRef is shared with useMediaCapture so it can
 * run detection on each video frame.
 */
export function useJediMode(
    stopRecording: () => void,
    addSystemMessage: (content: string) => void,
    setIsHandsFree: React.Dispatch<React.SetStateAction<boolean>>,
): UseJediModeReturn {
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);
    const lastGestureTimeRef = useRef<number>(0);
    const [currentGesture, setCurrentGesture] = useState<string | null>(null);

    // Initialize MediaPipe on mount
    useEffect(() => {
        const initMediaPipe = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );
                handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
                console.log("[NEXUS] Jedi Mode initialized.");
            } catch (e) {
                console.error("Failed to init MediaPipe:", e);
            }
        };
        initMediaPipe();
    }, []);

    /**
     * Interpret hand landmarks into discrete gestures.
     * Two gestures are currently supported:
     *   - Pinch (thumb + index close): toggle hands-free mode
     *   - Open Palm (all fingers extended): stop recording
     * A 2-second cooldown prevents rapid-fire triggers.
     */
    const processGestures = useCallback((landmarks: any[]) => {
        const now = Date.now();
        if (now - lastGestureTimeRef.current < 2000) return;

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const wrist = landmarks[0];

        // Pinch detection: thumb and index fingertips close together
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

        // Open palm: all fingertips far from wrist
        const indexDist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
        const middleDist = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
        const ringDist = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
        const pinkyDist = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);

        if (pinchDist < 0.05) {
            setCurrentGesture("✌️ Pinch");
            lastGestureTimeRef.current = now;
            setIsHandsFree(prev => !prev);
            addSystemMessage("✨ Jedi Action: Toggled Hands-Free Mode via Pinch gesture");
        } else if (indexDist > 0.4 && middleDist > 0.4 && ringDist > 0.4 && pinkyDist > 0.4) {
            if (pinchDist > 0.1) {
                setCurrentGesture("✋ Open Palm");
                lastGestureTimeRef.current = now;
                stopRecording();
                addSystemMessage("✨ Jedi Action: Stopped mic via Open Palm gesture");
            }
        }

        setTimeout(() => setCurrentGesture(null), 1500);
    }, [addSystemMessage, stopRecording, setIsHandsFree]);

    return {
        handLandmarkerRef,
        currentGesture,
        setCurrentGesture,
        processGestures,
    };
}
