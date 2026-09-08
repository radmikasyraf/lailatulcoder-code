/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config, type Extension } from '@lailatul-coder/lailatul-coder-core';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';
interface ExtensionActionsViewProps {
    config: Config;
    /** The extension to manage. A fresh mount is expected per detail open. */
    extension: Extension;
    isActive: boolean;
    /** Current update state for this extension, if known. */
    updateState?: string;
    /** Whether to offer the favorite toggle (hidden in the Sources tab). */
    showFavorite?: boolean;
    onStatus: (status: StatusMessage | null) => void;
    /** Ask the parent list to reload (state changed). */
    onReload: () => void;
    /** Leave the detail and return to the list. */
    onExit: () => void;
}
export declare const ExtensionActionsView: ({ config, extension, isActive, updateState, showFavorite, onStatus, onReload, onExit, }: ExtensionActionsViewProps) => import("react").JSX.Element;
export {};
