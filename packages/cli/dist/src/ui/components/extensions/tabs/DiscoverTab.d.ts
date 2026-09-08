/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';
interface DiscoverTabProps {
    config: Config;
    isActive: boolean;
    onLockChange: (locked: boolean) => void;
    onStatus: (status: StatusMessage | null) => void;
    onInstalled: () => void;
    /** When set, only plugins from this marketplace are shown. */
    marketplaceFilter?: string;
    reloadSignal: number;
}
export declare const DiscoverTab: ({ config, isActive, onLockChange, onStatus, onInstalled, marketplaceFilter, reloadSignal, }: DiscoverTabProps) => import("react").JSX.Element;
export {};
