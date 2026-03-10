"use client";

import type { CustomAgent } from "@/lib/constants";

/**
 * CreateAgentModal — form overlay for designing a custom AI agent
 * with a name, emoji, description, and optional system prompt.
 */
interface CreateAgentModalProps {
    newAgent: Partial<CustomAgent>;
    onUpdate: (update: Partial<CustomAgent>) => void;
    onSave: () => void;
    onClose: () => void;
}

export function CreateAgentModal({
    newAgent,
    onUpdate,
    onSave,
    onClose,
}: CreateAgentModalProps) {
    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="create-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Create Your Agent</h2>
                <p>
                    Design a custom AI mode with your own personality and instructions.
                </p>

                <div className="form-field">
                    <label>Agent Name</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Fitness Coach"
                        value={newAgent.name || ""}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                    />
                </div>

                <div className="form-field">
                    <label>Emoji Icon</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 💪"
                        value={newAgent.emoji || ""}
                        onChange={(e) => onUpdate({ emoji: e.target.value })}
                        style={{ width: "80px" }}
                    />
                </div>

                <div className="form-field">
                    <label>Short Description</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="What does this agent do?"
                        value={newAgent.description || ""}
                        onChange={(e) => onUpdate({ description: e.target.value })}
                    />
                </div>

                <div className="form-field">
                    <label>System Prompt (optional)</label>
                    <textarea
                        className="form-input"
                        placeholder="Custom instructions for the AI..."
                        value={newAgent.systemPrompt || ""}
                        onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                    />
                </div>

                <div className="form-actions">
                    <button onClick={onClose} className="btn btn-ghost">
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="btn btn-primary"
                        disabled={!newAgent.name || !newAgent.description}
                    >
                        Create Agent
                    </button>
                </div>
            </div>
        </div>
    );
}
