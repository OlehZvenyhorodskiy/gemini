/**
 * Barrel export for all NEXUS custom hooks.
 *
 * After the God Component refactor, page.tsx imports everything
 * through this single entry point.
 */
export { useTheme, ALL_THEMES, THEME_PRESETS } from "./useTheme";
export type { ThemeMode, ThemePreset, CustomColors, UseThemeReturn } from "./useTheme";

export { useAudioEngine } from "./useAudioEngine";
export type { AudioQueueItem, AudioEngineAPI } from "./useAudioEngine";

export { useNexusSocket } from "./useNexusSocket";
export type {
    ServerMessage,
    ChatMessage,
    AgentMode,
    AgentState,
    UseNexusSocketReturn,
} from "./useNexusSocket";

export { useMediaCapture } from "./useMediaCapture";
export type { UseMediaCaptureReturn } from "./useMediaCapture";

export { useJediMode } from "./useJediMode";
export type { UseJediModeReturn } from "./useJediMode";
