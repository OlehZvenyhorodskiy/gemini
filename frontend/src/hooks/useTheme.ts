"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Supported visual themes — each maps to a CSS class on <html>.
 * "custom" is a user-defined palette applied via CSS variables.
 */
export type ThemeMode = "dark" | "light" | "midnight" | "sunset" | "ocean" | "forest" | "neon" | "rose" | "custom";

export const ALL_THEMES: ThemeMode[] = ["dark", "light", "midnight", "sunset", "ocean", "forest", "neon", "rose"];

/** Swatch colors used in the theme-picker UI */
export interface ThemePreset {
    label: string;
    bg: string;
    accent: string;
}

export const THEME_PRESETS: Record<ThemeMode, ThemePreset> = {
    dark: { label: "Dark", bg: "#0f0f13", accent: "#4285F4" },
    light: { label: "Light", bg: "#f8f9fa", accent: "#4285F4" },
    midnight: { label: "Midnight", bg: "#08081a", accent: "#8a64ff" },
    sunset: { label: "Sunset", bg: "#1a0f08", accent: "#ff9540" },
    ocean: { label: "Ocean", bg: "#081a20", accent: "#40e0d0" },
    forest: { label: "Forest", bg: "#0a1a0f", accent: "#4ccb68" },
    neon: { label: "Neon", bg: "#0a0a1a", accent: "#ff00ff" },
    rose: { label: "Rosé", bg: "#1a0f14", accent: "#ff6b9d" },
    custom: { label: "Custom", bg: "#1a1a24", accent: "#4285F4" },
};

export interface CustomColors {
    bgPrimary: string;
    bgSecondary: string;
    accent: string;
}

export interface UseThemeReturn {
    theme: ThemeMode;
    customColors: CustomColors;
    setCustomColors: React.Dispatch<React.SetStateAction<CustomColors>>;
    buttonStyle: "default" | "ios-glass";
    switchTheme: (next: ThemeMode) => void;
    applyCustomColors: () => void;
    toggleButtonStyle: (style: "default" | "ios-glass") => void;
    isThemePickerOpen: boolean;
    setIsThemePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * useTheme — owns all theming logic: switching presets, custom CSS
 * variables, button style toggling, and localStorage persistence.
 *
 * Extracted from the original page.tsx to keep the component clean.
 */
export function useTheme(): UseThemeReturn {
    const [theme, setTheme] = useState<ThemeMode>("dark");
    const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
    const [buttonStyle, setButtonStyle] = useState<"default" | "ios-glass">("default");
    const [customColors, setCustomColors] = useState<CustomColors>({
        bgPrimary: "#0f0f13",
        bgSecondary: "#1a1a24",
        accent: "#4285F4",
    });

    /**
     * Switch to one of the 6 preset themes or "custom".
     * Strips every theme class from <html>, applies the new one,
     * and persists the choice to localStorage.
     */
    const switchTheme = useCallback((next: ThemeMode) => {
        const allClasses = [...ALL_THEMES, "custom"];
        allClasses.forEach((c) => document.documentElement.classList.remove(c));
        document.documentElement.classList.add(next);
        setTheme(next);
        setIsThemePickerOpen(false);
        try { localStorage.setItem("nexus-theme", next); } catch { /* noop */ }
    }, []);

    /**
     * Apply user-picked colors as CSS variables and flip to "custom"
     * theme class so they actually take effect.
     */
    const applyCustomColors = useCallback(() => {
        const root = document.documentElement;
        root.classList.remove(...ALL_THEMES);
        root.classList.add("custom");
        root.style.setProperty("--bg-primary", customColors.bgPrimary);
        root.style.setProperty("--bg-secondary", customColors.bgSecondary);
        root.style.setProperty("--google-blue", customColors.accent);
        root.style.setProperty("--border-focus", customColors.accent);
        setTheme("custom");
        setIsThemePickerOpen(false);
        try {
            localStorage.setItem("nexus-theme", "custom");
            localStorage.setItem("nexus-custom-colors", JSON.stringify(customColors));
        } catch { /* noop */ }
    }, [customColors]);

    /**
     * Toggle between the default button look and the frosted-glass
     * "iOS" style by adding/removing a class on <html>.
     */
    const toggleButtonStyle = useCallback((style: "default" | "ios-glass") => {
        setButtonStyle(style);
        if (style === "ios-glass") {
            document.documentElement.classList.add("btn-style-ios-glass");
        } else {
            document.documentElement.classList.remove("btn-style-ios-glass");
        }
        try { localStorage.setItem("nexus-btn-style", style); } catch { /* noop */ }
    }, []);

    /**
     * Restore persisted theme, button style, and custom colors on mount.
     */
    useEffect(() => {
        try {
            const saved = localStorage.getItem("nexus-theme") as ThemeMode | null;
            const validThemes: ThemeMode[] = [...ALL_THEMES, "custom"];
            if (saved && validThemes.includes(saved)) {
                validThemes.forEach((c) => document.documentElement.classList.remove(c));
                document.documentElement.classList.add(saved);
                setTheme(saved);

                if (saved === "custom") {
                    try {
                        const savedColors = localStorage.getItem("nexus-custom-colors");
                        if (savedColors) {
                            const colors = JSON.parse(savedColors);
                            setCustomColors(colors);
                            document.documentElement.style.setProperty("--bg-primary", colors.bgPrimary);
                            document.documentElement.style.setProperty("--bg-secondary", colors.bgSecondary);
                            document.documentElement.style.setProperty("--google-blue", colors.accent);
                            document.documentElement.style.setProperty("--border-focus", colors.accent);
                        }
                    } catch { /* noop */ }
                }
            }

            const savedBtnStyle = localStorage.getItem("nexus-btn-style") as "default" | "ios-glass" | null;
            if (savedBtnStyle) {
                setButtonStyle(savedBtnStyle);
                if (savedBtnStyle === "ios-glass") {
                    document.documentElement.classList.add("btn-style-ios-glass");
                }
            }
        } catch { /* noop */ }
    }, []);

    return {
        theme,
        customColors,
        setCustomColors,
        buttonStyle,
        switchTheme,
        applyCustomColors,
        toggleButtonStyle,
        isThemePickerOpen,
        setIsThemePickerOpen,
    };
}
