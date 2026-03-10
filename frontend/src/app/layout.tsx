import type { Metadata } from "next";
import "./globals.css";
import ErrorBoundary from "./error-boundary";

export const metadata: Metadata = {
    title: "NEXUS — Multimodal AI Agent",
    description:
        "Your AI that sees, speaks, and creates. Built for the Gemini Live Agent Challenge.",
    keywords: [
        "Gemini",
        "AI Agent",
        "Multimodal",
        "Live API",
        "Google Cloud",
        "ADK",
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                {/* Google Sans via fonts.googleapis — falls back to Inter gracefully */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Inter:wght@300;400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                <meta name="color-scheme" content="dark light" />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </head>
            <body className="antialiased" suppressHydrationWarning>
                <ErrorBoundary>{children}</ErrorBoundary>
            </body>
        </html>
    );
}
