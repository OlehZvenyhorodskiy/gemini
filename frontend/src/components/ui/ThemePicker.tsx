"use client";

import { useCallback } from "react";
import {
    useTheme,
    ALL_THEMES,
    THEME_PRESETS,
} from "@/hooks";
import type { UseThemeReturn } from "@/hooks";

/**
 * ThemePicker — reusable dropdown panel for theme selection,
 * button style toggling, and custom color inputs.
 *
 * Appears in both the LandingPage top-right corner and the
 * AppHeader, so we extracted it once to kill the duplication.
 */
interface ThemePickerProps {
    theme: UseThemeReturn["theme"];
    customColors: UseThemeReturn["customColors"];
    setCustomColors: UseThemeReturn["setCustomColors"];
    buttonStyle: UseThemeReturn["buttonStyle"];
    switchTheme: UseThemeReturn["switchTheme"];
    applyCustomColors: UseThemeReturn["applyCustomColors"];
    toggleButtonStyle: UseThemeReturn["toggleButtonStyle"];
    isThemePickerOpen: boolean;
    setIsThemePickerOpen: (open: boolean) => void;
}

export function ThemePicker({
    theme,
    customColors,
    setCustomColors,
    buttonStyle,
    switchTheme,
    applyCustomColors,
    toggleButtonStyle,
    isThemePickerOpen,
    setIsThemePickerOpen,
}: ThemePickerProps) {
    return (
        <div className="theme-picker">
            <button
                onClick={() => setIsThemePickerOpen(!isThemePickerOpen)}
                className="theme-picker-btn"
                title="Customise settings"
            >
                ⚙️ Customise
            </button>
            {isThemePickerOpen && (
                <div className="theme-dropdown">
                    <h3>Theme Colors</h3>
                    <div className="theme-swatches">
                        {ALL_THEMES.map((t) => (
                            <div
                                key={t}
                                className={`theme-swatch ${theme === t ? "active" : ""}`}
                                onClick={() => switchTheme(t)}
                            >
                                <div
                                    className="swatch-preview"
                                    style={{
                                        background: `linear-gradient(135deg, ${THEME_PRESETS[t].bg}, ${THEME_PRESETS[t].accent})`,
                                    }}
                                />
                                <span className="swatch-label">{THEME_PRESETS[t].label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="theme-divider" />
                    <div className="custom-colors-section">
                        <h4>UI Button Styles</h4>
                        <div className="style-toggle-group">
                            <button
                                className={`style-toggle-btn ${buttonStyle === "default" ? "active" : ""}`}
                                onClick={() => toggleButtonStyle("default")}
                            >
                                Default
                            </button>
                            <button
                                className={`style-toggle-btn ${buttonStyle === "ios-glass" ? "active" : ""}`}
                                onClick={() => toggleButtonStyle("ios-glass")}
                            >
                                iPhone Glass
                            </button>
                        </div>
                    </div>

                    <div className="theme-divider" />
                    <div className="custom-colors-section">
                        <h4>Custom Base Colors</h4>
                        <div className="color-row">
                            <label>Background</label>
                            <input
                                type="color"
                                className="color-input"
                                value={customColors.bgPrimary}
                                onChange={(e) => setCustomColors((c) => ({ ...c, bgPrimary: e.target.value }))}
                            />
                        </div>
                        <div className="color-row">
                            <label>Surface</label>
                            <input
                                type="color"
                                className="color-input"
                                value={customColors.bgSecondary}
                                onChange={(e) => setCustomColors((c) => ({ ...c, bgSecondary: e.target.value }))}
                            />
                        </div>
                        <div className="color-row">
                            <label>Accent</label>
                            <input
                                type="color"
                                className="color-input"
                                value={customColors.accent}
                                onChange={(e) => setCustomColors((c) => ({ ...c, accent: e.target.value }))}
                            />
                        </div>
                        <button className="apply-custom-btn" onClick={applyCustomColors}>
                            Apply Custom Theme
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
