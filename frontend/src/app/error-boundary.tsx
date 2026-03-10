"use client";

import React, { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React Error Boundary — catches crashes anywhere in the component tree
 * and shows a friendly recovery UI instead of a blank white screen.
 * Wrapped around the main NexusPage in the layout.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log to console for debugging — in prod this could go to a service
        console.error("[NEXUS ErrorBoundary]", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "100vh",
                        background: "var(--bg-primary, #0f0f13)",
                        color: "var(--text-primary, #e8eaed)",
                        fontFamily: "'Google Sans', 'Inter', sans-serif",
                        textAlign: "center",
                        padding: "40px 20px",
                        gap: "20px",
                    }}
                >
                    <div style={{ fontSize: "3rem" }}>⚠️</div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
                        Something went wrong
                    </h1>
                    <p
                        style={{
                            fontSize: "0.9375rem",
                            color: "var(--text-secondary, #9aa0a6)",
                            maxWidth: "420px",
                            lineHeight: 1.5,
                            margin: 0,
                        }}
                    >
                        NEXUS hit an unexpected error. This is usually temporary —
                        try refreshing the page or resetting the session.
                    </p>
                    {this.state.error && (
                        <pre
                            style={{
                                fontSize: "0.75rem",
                                background: "rgba(234, 67, 53, 0.08)",
                                border: "1px solid rgba(234, 67, 53, 0.2)",
                                borderRadius: "10px",
                                padding: "12px 16px",
                                maxWidth: "500px",
                                overflow: "auto",
                                textAlign: "left",
                                color: "#ea4335",
                            }}
                        >
                            {this.state.error.message}
                        </pre>
                    )}
                    <div style={{ display: "flex", gap: "12px" }}>
                        <button
                            onClick={this.handleReset}
                            style={{
                                padding: "10px 24px",
                                borderRadius: "20px",
                                border: "1px solid rgba(255,255,255,0.15)",
                                background: "transparent",
                                color: "var(--text-primary, #e8eaed)",
                                fontSize: "0.875rem",
                                fontWeight: 500,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: "10px 24px",
                                borderRadius: "20px",
                                border: "none",
                                background: "#4285F4",
                                color: "white",
                                fontSize: "0.875rem",
                                fontWeight: 500,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
