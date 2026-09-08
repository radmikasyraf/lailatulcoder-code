/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import type { HeatmapIntensity } from '../utils/asciiCharts.js';
import type { TimeRange } from '@lailatul-coder/lailatul-coder-core';
export type StatsTab = 'session' | 'activity' | 'efficiency';
export declare const TAB_DEFS: Array<{
    tab: StatsTab;
    label: () => string;
}>;
export declare const RANGE_CYCLE: TimeRange[];
export declare function getHeatmapColors(): Record<HeatmapIntensity, string>;
export declare function getSeriesColors(): string[];
export declare function getRangeLabel(range: string): string;
export declare function fmtTokens(n: number): string;
export declare function fmtDurationShort(ms: number): string;
export declare function fmtSuccessBar(rate: number): string;
export declare function getSuccessColor(rate: number): string;
export declare function getCacheColor(rate: number): string;
export declare const TableRow: React.FC<{
    cells: Array<{
        text: string;
        width: number;
        color?: string;
        bold?: boolean;
    }>;
}>;
