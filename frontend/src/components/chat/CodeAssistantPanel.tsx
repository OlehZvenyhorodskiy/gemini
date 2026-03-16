"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { 
    Code2, 
    FileCode, 
    X, 
    Maximize2, 
    Minimize2,
    Play, 
    Copy,
    Check,
    Loader2,
    MessageSquare,
    Terminal
} from "lucide-react";
import { SimpleMarkdown } from "@/components/ui/SimpleMarkdown";
import type { ChatMessage } from "@/hooks";

/**
 * CodeAssistantPanel — the dedicated workspace for the Code Copilot mode.
 * 
 * v2 Features:
 * - Line numbers alongside the editor
 * - "Run Code" button (sends to backend for execution)
 * - Click line number to ask AI about that specific line
 * - Real-time code streaming from agent messages
 * - Tab key support in editor
 * - Copy with confirmation feedback
 */

interface CodeAssistantPanelProps {
    mode: string;
    messages: ChatMessage[];
    onClose?: () => void;
    wsRef?: React.MutableRefObject<WebSocket | null>;
    addMessage?: (
        role: "user" | "agent",
        type: ChatMessage["type"],
        content: string,
        imageData?: string,
        imageMime?: string,
        toolName?: string,
        toolArgs?: Record<string, unknown>,
    ) => void;
}

export function CodeAssistantPanel({ mode, messages, onClose, wsRef, addMessage }: CodeAssistantPanelProps) {
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(true);
    const [editContent, setEditContent] = useState("");
    const [copied, setCopied] = useState(false);
    const [runOutput, setRunOutput] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedLine, setSelectedLine] = useState<number | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [panelWidth, setPanelWidth] = useState(500); // Default width in pixels
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Synchronize with the latest tool results or code blocks from the chat
    useEffect(() => {
        // Priority 1: Tool results (explicit file reads or code gen tools)
        const lastToolResult = [...messages].reverse().find(
            m => m.type === "tool" && (m.toolName === "read_file" || m.toolName === "generate_code" || m.toolName === "execute_code")
        );

        if (lastToolResult && lastToolResult.toolResult) {
            const result = lastToolResult.toolResult as Record<string, unknown>;
            
            // Handle execution results
            if (lastToolResult.toolName === "execute_code" && result.output) {
                setRunOutput(String(result.output));
                setIsRunning(false);
                return;
            }
            
            if (result.status === "success" && result.file_path) {
                setActiveFile(String(result.file_path));
                setFileContent(String(result.content || ""));
                setEditContent(String(result.content || ""));
                return;
            } else if (result.code) {
                setActiveFile(String(result.filename || "generated_snippet.ts"));
                setFileContent(String(result.code));
                setEditContent(String(result.code));
                return;
            }
        }

        // Priority 2: Markdown code blocks in the latest agent message
        // Search ALL agent text messages (not just ones containing ```)
        // because during streaming the closing ``` may not have arrived yet
        const lastAgentMsg = [...messages].reverse().find(
            m => m.role === "agent" && m.type === "text"
        );

        if (lastAgentMsg && lastAgentMsg.content.includes("```")) {
            // Global regex: find ALL code blocks, even unclosed ones (streaming)
            const codeBlockRegex = /```(\w+)?\n([\s\S]*?)(?:```|$)/g;
            let match;
            let lastMatch = null;
            
            // Iterate to get the LAST code block in the message
            while ((match = codeBlockRegex.exec(lastAgentMsg.content)) !== null) {
                lastMatch = match;
            }

            if (lastMatch && lastMatch[2].trim()) {
                const lang = lastMatch[1] || "txt";
                const code = lastMatch[2];
                
                setActiveFile(`snippet.${lang}`);
                setFileContent(code);
                // Always update editor content in real-time during streaming
                setEditContent(code);
            }
        }
    }, [messages]);

    // Resizing logic
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            // Constrain width between 300px and 80% of screen
            if (newWidth > 320 && newWidth < window.innerWidth * 0.8) {
                setPanelWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    // Sync scroll between line numbers and editor
    const handleEditorScroll = useCallback(() => {
        if (editorRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = editorRef.current.scrollTop;
        }
    }, []);

    // Handle tab key in editor
    const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const textarea = e.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newVal = editContent.substring(0, start) + "    " + editContent.substring(end);
            setEditContent(newVal);
            // Restore cursor position after state update
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 4;
            });
        }
    }, [editContent]);

    // Copy to clipboard with feedback
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(isEditing ? editContent : fileContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [isEditing, editContent, fileContent]);

    // Run code via direct API call (bypasses LLM for deterministic execution)
    const handleRunCode = useCallback(async () => {
        const code = isEditing ? editContent : fileContent;
        if (!code.trim()) return;
        
        setIsRunning(true);
        setRunOutput(null);
        
        const lang = getFileLang(activeFile || "snippet.py");

        try {
            // Call the direct execution endpoint — no LLM involved
            const baseUrl = window.location.protocol + "//" + window.location.host;
            // Handle local dev (frontend on :3000, backend on :8080)
            const apiUrl = baseUrl.includes("3000") 
                ? "http://localhost:8080/api/execute" 
                : `${baseUrl}/api/execute`;

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, language: lang })
            });

            const result = await response.json();
            
            if (result.error) {
                setRunOutput(`❌ Error:\n${result.error}`);
            } else {
                const out = result.stdout || "";
                const err = result.stderr ? `\n⚠️ Warnings/Errors:\n${result.stderr}` : "";
                const exitCode = result.exit_code !== undefined 
                    ? `\n\n[Process exited with code ${result.exit_code}]` 
                    : "";
                setRunOutput(out + err + exitCode || "Execution completed with no output.");
            }
        } catch (e) {
            setRunOutput(`❌ Connection Error:\nFailed to execute code. Is the backend running?`);
        } finally {
            setIsRunning(false);
        }
    }, [isEditing, editContent, fileContent, activeFile]);

    // Ask about a specific line
    const handleLineClick = useCallback((lineNum: number) => {
        setSelectedLine(lineNum);
        const lines = (isEditing ? editContent : fileContent).split('\n');
        const lineContent = lines[lineNum - 1] || "";
        
        if (!lineContent.trim() || !wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        const question = `Explain line ${lineNum} of the current code: \`${lineContent.trim()}\``;
        
        if (addMessage) {
            addMessage("user", "text", question);
        }
        wsRef.current.send(JSON.stringify({ type: "text", content: question }));
        
        // Clear selection after a moment
        setTimeout(() => setSelectedLine(null), 3000);
    }, [wsRef, addMessage, isEditing, editContent, fileContent]);

    if (mode !== "code") return null;

    const lines = (isEditing ? editContent : fileContent).split('\n');
    const lineCount = lines.length;
    return (
        <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`code-assistant-panel ${isExpanded ? 'expanded' : ''} ${isResizing ? 'resizing' : ''}`}
            style={{
                width: isExpanded ? "100%" : `${panelWidth}px`,
                maxWidth: "90vw",
                height: "100%",
                background: "rgba(10, 11, 14, 0.8)",
                backdropFilter: "blur(24px)",
                borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                zIndex: 10,
                boxShadow: isExpanded ? "none" : "-30px 0 80px rgba(0,0,0,0.8)",
                flexShrink: 0,
                overflow: "hidden",
            }}
        >
            {/* Horizontal Resize Handle (Left edge) */}
            {!isExpanded && (
                <div 
                    className="code-resize-handle" 
                    onMouseDown={startResizing}
                >
                    <div className="resize-indicator-line" />
                </div>
            )}
            <div style={{ direction: "ltr", display: "flex", flexDirection: "column", height: "100%", width: "100%", position: "relative" }}>
            {/* Minimal Header — just file info */}
            <div className="code-panel-header">
                <div className="code-panel-title-group">
                    <div className="code-panel-icon">
                        <Code2 size={20} />
                    </div>
                    <div>
                        <h3 className="code-panel-title">{activeFile || "Code Workspace"}</h3>
                        <div className="code-panel-status">
                            <span className="code-panel-status-dot" />
                            <p className="code-panel-status-text">
                                {activeFile ? `${getFileLang(activeFile).toUpperCase()} · ${lineCount} lines` : 'No file'}
                            </p>
                        </div>
                    </div>
                </div>
                {onClose && (
                    <button 
                        onClick={onClose}
                        className="code-panel-icon-btn close"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Main Area — Always a code editor with line numbers */}
            <div className="code-panel-body">
                {activeFile ? (
                    <>
                        {/* Editor with Line Numbers — always visible */}
                        <div className="code-editor-container">
                            {isLoading ? (
                                <div className="code-loading">
                                    <Loader2 className="animate-spin text-[var(--google-blue)]" size={32} />
                                    <p>Fetching project source...</p>
                                </div>
                            ) : (
                                <div className="code-editor-with-lines">
                                    {/* Line numbers — always visible */}
                                    <div 
                                        ref={lineNumbersRef}
                                        className="code-line-numbers"
                                    >
                                        {Array.from({ length: lineCount }, (_, i) => (
                                            <button
                                                key={i + 1}
                                                className={`code-line-number ${selectedLine === i + 1 ? 'selected' : ''}`}
                                                onClick={() => handleLineClick(i + 1)}
                                                title={`Ask AI about line ${i + 1}`}
                                            >
                                                {i + 1}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Editable textarea — always in edit mode */}
                                    <textarea
                                        ref={editorRef}
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        onScroll={handleEditorScroll}
                                        onKeyDown={handleEditorKeyDown}
                                        className="code-editor-textarea"
                                        spellCheck={false}
                                        wrap="off"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Run Output Panel */}
                        {runOutput !== null && (
                            <div className="code-run-output">
                                <div className="code-run-output-header">
                                    <Terminal size={14} />
                                    <span>Output</span>
                                    <button 
                                        onClick={() => setRunOutput(null)}
                                        className="code-run-output-close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <pre className="code-run-output-content">{runOutput}</pre>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="code-empty-state">
                        <div className="code-empty-glow" />
                        <div className="code-empty-icon">
                            <Code2 size={48} className="text-[var(--google-blue)]" />
                        </div>
                        <h4 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--google-blue)] to-purple-400">
                            Nexus Code Workspace
                        </h4>
                        <p className="text-[var(--text-tertiary)] max-w-xs mx-auto text-sm leading-relaxed mb-6">
                            Interact and execute code in real-time. Ask me to read your files or help you build something new.
                        </p>
                        <div className="code-empty-hints">
                            {[
                                { icon: "📂", label: "Read project structure", prompt: "Explain the project structure and list top level files" },
                                { icon: "🔍", label: "Analyze local code", prompt: "List files in the current directory and explain what they do" },
                                { icon: "🐍", label: "Write Python Logic", prompt: "Write a high-performance Python script that calculates prime numbers" },
                                { icon: "⚡", label: "Hello World", prompt: "Please write a Hello World program in Python. Provide only the code snippet so I can run it." }
                            ].map((hint, idx) => (
                                <button 
                                    key={idx}
                                    className="code-hint-card"
                                    onClick={() => {
                                        if (addMessage && wsRef?.current?.readyState === WebSocket.OPEN) {
                                            addMessage("user", "text", hint.prompt);
                                            wsRef.current.send(JSON.stringify({ type: "text", content: hint.prompt }));
                                        }
                                    }}
                                >
                                    <span className="text-lg">{hint.icon}</span>
                                    <span className="text-xs font-semibold">{hint.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Toolbar — all actions moved here */}
            <div className="code-panel-footer">
                <div className="code-panel-footer-left">
                    <div className="code-panel-footer-status">
                        <div className="code-panel-status-dot" />
                        {isRunning ? 'RUNNING' : 'READY'}
                    </div>
                    {selectedLine && (
                        <span className="code-panel-footer-line">
                            <MessageSquare size={10} /> Ln {selectedLine}
                        </span>
                    )}
                </div>
                <div className="code-panel-footer-actions">
                    <button 
                        onClick={handleCopy}
                        className="code-footer-btn"
                        title="Copy code"
                        disabled={!activeFile}
                    >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button 
                        onClick={handleRunCode}
                        disabled={isRunning || !activeFile}
                        className="code-footer-btn run"
                        title="Run code"
                    >
                        {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        <span>{isRunning ? 'Running' : 'Run'}</span>
                    </button>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="code-footer-btn"
                        title={isExpanded ? "Minimize" : "Maximize"}
                    >
                        {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    </button>
                </div>
            </div>
            </div>
        </motion.div>
    );
}

function getFileLang(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'py': return 'python';
        case 'js':
        case 'jsx': return 'javascript';
        case 'ts':
        case 'tsx': return 'typescript';
        case 'css': return 'css';
        case 'html': return 'html';
        case 'json': return 'json';
        case 'md': return 'markdown';
        case 'cpp':
        case 'cc':
        case 'cxx': return 'cpp';
        case 'c': return 'c';
        case 'java': return 'java';
        case 'rs': return 'rust';
        case 'go': return 'go';
        case 'rb': return 'ruby';
        case 'sh':
        case 'bash': return 'bash';
        default: return '';
    }
}
