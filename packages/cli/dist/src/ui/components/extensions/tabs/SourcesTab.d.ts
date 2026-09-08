/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';
interface SourcesTabProps {
    config: Config;
    isActive: boolean;
    onLockChange: (locked: boolean) => void;
    onStatus: (status: StatusMessage | null) => void;
    onChanged: () => void;
    /** Switch to the Discover tab filtered to the given marketplace. */
    onBrowse: (marketplaceName: string) => void;
    /** Provide a context-aware footer hint for the list (null = default). */
    onFooter: (hint: string | null) => void;
    reloadSignal: number;
}
export declare const SourcesTab: ({ config, isActive, onLockChange, onStatus, onChanged, onBrowse, onFooter, reloadSignal, }: SourcesTabProps) => import("react").JSX.Element;
export {};
