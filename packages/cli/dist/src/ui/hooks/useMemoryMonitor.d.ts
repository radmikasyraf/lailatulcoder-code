/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type HistoryItemWithoutId } from '../types.js';
export declare const MEMORY_WARNING_THRESHOLD: number;
export declare const MEMORY_UI_COMPACT_THRESHOLD: () => number;
export declare const MEMORY_CHECK_INTERVAL: number;
export declare const MEMORY_DEBUG_INTERVAL: number;
export declare const UI_COMPACT_COOLDOWN_MS: number;
interface MemoryMonitorOptions {
    addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
    compactOldItems?: () => void;
}
export declare const useMemoryMonitor: ({ addItem, compactOldItems, }: MemoryMonitorOptions) => void;
export {};
