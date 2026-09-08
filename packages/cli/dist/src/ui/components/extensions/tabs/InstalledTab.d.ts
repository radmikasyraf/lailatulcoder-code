/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';
interface InstalledTabProps {
    config: Config;
    isActive: boolean;
    onLockChange: (locked: boolean) => void;
    onStatus: (status: StatusMessage | null) => void;
    extensionsUpdateState: Map<string, string>;
    reloadSignal: number;
}
export declare const InstalledTab: ({ config, isActive, onLockChange, onStatus, extensionsUpdateState, reloadSignal, }: InstalledTabProps) => import("react").JSX.Element;
export {};
