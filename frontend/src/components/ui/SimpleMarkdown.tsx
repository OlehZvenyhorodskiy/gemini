"use client";

/**
 * SimpleMarkdown — lightweight inline markdown renderer.
 *
 * Handles the most common patterns that Gemini outputs in its text
 * responses without pulling in a heavy dependency like react-markdown.
 * Keeps the bundle lean while making agent responses look polished.
 *
 * Supported syntax:
 *   **bold**       → <strong>
 *   *italic*       → <em>
 *   `inline code`  → <code>
 *   ```code block``` → <pre><code>
 *   [text](url)    → <a>
 *   ### Heading     → <h3> (h1-h4)
 *   - list item    → <li>
 */

interface SimpleMarkdownProps {
    content: string;
    className?: string;
}

export function SimpleMarkdown({ content, className }: SimpleMarkdownProps) {
    if (!content) return null;

    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Code block (triple backtick)
        if (line.trim().startsWith("```")) {
            const lang = line.trim().replace(/^```/, "").trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith("```")) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            elements.push(
                <pre
                    key={`code-${i}`}
                    style={{
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "8px",
                        padding: "12px 16px",
                        fontSize: "0.8125rem",
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        overflowX: "auto",
                        border: "1px solid var(--border-primary)",
                        margin: "8px 0",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                    }}
                >
                    {lang && (
                        <div style={{
                            fontSize: "0.6875rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--google-blue)",
                            marginBottom: "8px",
                            fontWeight: 600,
                        }}>
                            {lang}
                        </div>
                    )}
                    <code>{codeLines.join("\n")}</code>
                </pre>
            );
            continue;
        }

        // Headings
        if (line.startsWith("#### ")) {
            elements.push(<h4 key={`h4-${i}`} style={{ margin: "12px 0 4px", fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>{renderInline(line.slice(5))}</h4>);
            i++;
            continue;
        }
        if (line.startsWith("### ")) {
            elements.push(<h3 key={`h3-${i}`} style={{ margin: "14px 0 6px", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{renderInline(line.slice(4))}</h3>);
            i++;
            continue;
        }
        if (line.startsWith("## ")) {
            elements.push(<h2 key={`h2-${i}`} style={{ margin: "16px 0 8px", fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)" }}>{renderInline(line.slice(3))}</h2>);
            i++;
            continue;
        }
        if (line.startsWith("# ")) {
            elements.push(<h1 key={`h1-${i}`} style={{ margin: "16px 0 8px", fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>{renderInline(line.slice(2))}</h1>);
            i++;
            continue;
        }

        // List items (unordered)
        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            const listItems: React.ReactNode[] = [];
            while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
                const itemText = lines[i].trim().replace(/^[-*]\s+/, "");
                listItems.push(
                    <li key={`li-${i}`} style={{ marginBottom: "4px", paddingLeft: "4px" }}>
                        {renderInline(itemText)}
                    </li>
                );
                i++;
            }
            elements.push(
                <ul key={`ul-${i}`} style={{ margin: "8px 0", paddingLeft: "20px", listStyleType: "disc" }}>
                    {listItems}
                </ul>
            );
            continue;
        }

        // Numbered list items
        if (/^\d+\.\s/.test(line.trim())) {
            const listItems: React.ReactNode[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
                const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
                listItems.push(
                    <li key={`oli-${i}`} style={{ marginBottom: "4px", paddingLeft: "4px" }}>
                        {renderInline(itemText)}
                    </li>
                );
                i++;
            }
            elements.push(
                <ol key={`ol-${i}`} style={{ margin: "8px 0", paddingLeft: "20px" }}>
                    {listItems}
                </ol>
            );
            continue;
        }

        // Empty lines → small spacer
        if (line.trim() === "") {
            elements.push(<div key={`space-${i}`} style={{ height: "8px" }} />);
            i++;
            continue;
        }

        // Regular paragraph
        elements.push(
            <p key={`p-${i}`} style={{ margin: "4px 0", lineHeight: 1.6 }}>
                {renderInline(line)}
            </p>
        );
        i++;
    }

    return <div className={className}>{elements}</div>;
}


/**
 * Handles inline formatting: **bold**, *italic*, `code`, [text](url)
 * Returns an array of ReactNodes mixing plain text and styled spans.
 */
function renderInline(text: string): React.ReactNode {
    // Pattern matches: **bold**, *italic*, `code`, [label](url)
    const inlinePattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = inlinePattern.exec(text)) !== null) {
        // Push text before this match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        if (match[1]) {
            // **bold**
            parts.push(<strong key={`b-${key++}`} style={{ fontWeight: 600 }}>{match[2]}</strong>);
        } else if (match[3]) {
            // *italic*
            parts.push(<em key={`i-${key++}`}>{match[4]}</em>);
        } else if (match[5]) {
            // `inline code`
            parts.push(
                <code
                    key={`c-${key++}`}
                    style={{
                        background: "rgba(var(--google-blue), 0.1)",
                        backgroundColor: "rgba(66, 133, 244, 0.15)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "0.85em",
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}
                >
                    {match[6]}
                </code>
            );
        } else if (match[7]) {
            // [text](url)
            parts.push(
                <a
                    key={`a-${key++}`}
                    href={match[9]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--google-blue)", textDecoration: "underline" }}
                >
                    {match[8]}
                </a>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Push remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length === 1 ? parts[0] : parts;
}
