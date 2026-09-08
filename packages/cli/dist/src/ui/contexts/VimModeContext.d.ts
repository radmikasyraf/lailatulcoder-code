/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LoadedSettings } from '../../config/settings.js';
export type VimMode = 'NORMAL' | 'INSERT';
interface VimModeStateType {
    vimEnabled: boolean;
    vimMode: VimMode;
}
interface VimModeActionsType {
    toggleVimEnabled: () => Promise<boolean>;
    setVimMode: (mode: VimMode) => void;
}
export declare const VimModeProvider: ({ children, settings, }: {
    children: React.ReactNode;
    settings: LoadedSettings;
}) => import("react").JSX.Element;
/** Subscribe to vim mode state (vimEnabled, vimMode). Re-renders on mode change. */
export declare const useVimModeState: () => VimModeStateType;
/** Subscribe to vim mode actions (toggleVimEnabled, setVimMode). Stable — never triggers re-render. */
export declare const useVimModeActions: () => VimModeActionsType;
/** Combined hook for consumers that need both state and actions. Prefer the split hooks when possible. */
export declare const useVimMode: () => {
    toggleVimEnabled: () => Promise<boolean>;
    setVimMode: (mode: VimMode) => void;
    vimEnabled: boolean;
    vimMode: VimMode;
};
export {};
