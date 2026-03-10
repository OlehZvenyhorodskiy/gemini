"use client";

/**
 * VideoPreview — floating overlay showing the camera or screen
 * share feed, Terminator Vision bounding boxes, and Jedi Mode
 * gesture indicator badge.
 */

interface BBox {
    id: string;
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    label?: string;
    createdAt: number;
}

interface VideoPreviewProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    boundingBoxes: BBox[];
    currentGesture: string | null;
}

export function VideoPreview({ videoRef, boundingBoxes, currentGesture }: VideoPreviewProps) {
    return (
        <div className="video-preview">
            <video ref={videoRef} autoPlay playsInline muted />

            {/* Terminator Vision Overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                {boundingBoxes.map(box => {
                    const width = box.xmax - box.xmin;
                    const height = box.ymax - box.ymin;
                    return (
                        <g key={box.id} className="animate-[pulse_1.5s_ease-in-out_infinite]">
                            <rect
                                x={box.xmin}
                                y={box.ymin}
                                width={width}
                                height={height}
                                fill="rgba(255, 40, 40, 0.15)"
                                stroke="#ff2a2a"
                                strokeWidth="4"
                                rx="4"
                            />
                            {/* Crosshair target corners */}
                            <path d={`M ${box.xmin} ${box.ymin + 30} L ${box.xmin} ${box.ymin} L ${box.xmin + 30} ${box.ymin}`} fill="none" stroke="#ff2a2a" strokeWidth="6" />
                            <path d={`M ${box.xmax} ${box.ymin + 30} L ${box.xmax} ${box.ymin} L ${box.xmax - 30} ${box.ymin}`} fill="none" stroke="#ff2a2a" strokeWidth="6" />
                            <path d={`M ${box.xmin} ${box.ymax - 30} L ${box.xmin} ${box.ymax} L ${box.xmin + 30} ${box.ymax}`} fill="none" stroke="#ff2a2a" strokeWidth="6" />
                            <path d={`M ${box.xmax} ${box.ymax - 30} L ${box.xmax} ${box.ymax} L ${box.xmax - 30} ${box.ymax}`} fill="none" stroke="#ff2a2a" strokeWidth="6" />

                            {box.label && (
                                <text
                                    x={box.xmin}
                                    y={box.ymin - 10}
                                    fill="#ff2a2a"
                                    fontSize="28"
                                    fontFamily="monospace"
                                    fontWeight="bold"
                                    className="drop-shadow-md tracking-wider"
                                >
                                    [&nbsp;{box.label}&nbsp;]
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {currentGesture && (
                <div style={{
                    position: "absolute",
                    top: "16px",
                    left: "16px",
                    padding: "12px 20px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid var(--google-blue)",
                    color: "#fff",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                    animation: "pulse 2s infinite"
                }}>
                    <span>⚡</span>
                    <span>{currentGesture}</span>
                </div>
            )}
        </div>
    );
}

export type { BBox };
