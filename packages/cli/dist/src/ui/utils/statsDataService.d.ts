/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type AggregatedReport, type TimeRange, type UsageSummaryRecord } from '@lailatul-coder/lailatul-coder-core';
export interface StatsData {
    report: AggregatedReport;
    heatmap: Record<string, number>;
    currentStreak: number;
    longestStreak: number;
    tokensPerDay: Array<{
        date: string;
        model: string;
        tokens: number;
    }>;
    delta: {
        sessions: number | null;
        duration: number | null;
        tokens: number | null;
        cacheRate: number | null;
        toolSuccess: number | null;
        avgLatency: number | null;
    } | null;
    efficiency: {
        cacheHitRate: number;
        toolSuccessRate: number;
        avgLatencyMs: number | null;
    };
    toolLeaderboard: Array<{
        name: string;
        count: number;
        totalDurationMs: number;
        successRate: number;
    }>;
}
export declare function getPreviousRangeBounds(range: TimeRange): {
    start: Date;
    end: Date;
} | null;
export declare function computeDelta(current: AggregatedReport, previous: AggregatedReport): {
    sessions: number | null;
    duration: number | null;
    tokens: number | null;
    cacheRate: number | null;
    toolSuccess: number | null;
    avgLatency: number | null;
};
export declare function loadStatsData(range: TimeRange, currentSession?: UsageSummaryRecord): Promise<StatsData>;
