/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Extension } from '@lailatul-coder/lailatul-coder-core';
export type PluginDetailAction = 'toggle' | 'favorite' | 'change-scope' | 'mark-update' | 'update' | 'uninstall';
interface PluginDetailViewProps {
    extension: Extension;
    scope: string;
    isFavorite: boolean;
    hasUpdateAvailable: boolean;
    isFocused: boolean;
    /** Whether to offer the favorite toggle (hidden in the Sources tab). */
    showFavorite?: boolean;
    onAction: (action: PluginDetailAction) => void;
}
export declare const PluginDetailView: ({ extension, scope, isFavorite, hasUpdateAvailable, isFocused, showFavorite, onAction, }: PluginDetailViewProps) => import("react").JSX.Element;
export {};
