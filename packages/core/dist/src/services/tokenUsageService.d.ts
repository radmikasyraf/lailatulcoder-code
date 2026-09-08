/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import type { ApiResponseEvent } from '../telemetry/types.js';
declare const SCHEMA_VERSION = 1;
export type TokenUsagePeriod = 'day' | 'month';
export type TokenUsageExportFormat = 'json' | 'csv';
export interface TokenUsageRecord {
    schemaVersion: typeof SCHEMA_VERSION;
    id: string;
    timestamp: string;
    /**
     * Calendar date in the local timezone of the process that wrote this record.
     * Records written from different timezones keep their original local bucket.
     */
    localDate: string;
    /**
     * Calendar month in the local timezone of the process that wrote this record.
     * Records written from different timezones keep their original local bucket.
     */
    localMonth: string;
    sessionId: string;
    model: string;
    authType: string;
    source: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
    /**
     * End-to-end API response duration from telemetry. This is not generation
     * duration, TTFT, or TPS; those remain owned by #4252's timing surface.
     */
    apiDurationMs: number;
}
export interface TokenUsageTotals {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
    apiDurationMs: number;
}
export interface TokenUsageGroupSummary extends TokenUsageTotals {
    key: string;
    model?: string;
    authType?: string;
    source?: string;
}
export interface TokenUsageSummary {
    period: TokenUsagePeriod;
    value: string;
    generatedAt: string;
    totals: TokenUsageTotals;
    byModel: TokenUsageGroupSummary[];
    byAuthType: TokenUsageGroupSummary[];
    byModelAndAuthType: TokenUsageGroupSummary[];
    bySource: TokenUsageGroupSummary[];
}
export interface TokenUsageQuery {
    period: TokenUsagePeriod;
    value?: string;
}
export interface TokenUsageExportOptions extends TokenUsageQuery {
    format: TokenUsageExportFormat;
}
export declare function getTokenUsageFilePath(month: string): string;
export declare function apiResponseEventToTokenUsageRecord(config: Config, event: ApiResponseEvent): TokenUsageRecord;
export declare function recordTokenUsageFromApiResponse(config: Config, event: ApiResponseEvent): Promise<void>;
/** @internal Override the time source for testing cooldown behavior. */
export declare function __overrideNowForTesting(fn: () => number): void;
/** @internal Reset token usage failure rate-limiting state. For testing only. */
export declare function resetTokenUsageFailureLogging(): void;
export declare function recordTokenUsageFromApiResponseBestEffort(config: Config, event: ApiResponseEvent): void;
export declare function queryTokenUsage(query: TokenUsageQuery): Promise<TokenUsageSummary>;
export declare function formatTokenUsageSummaryAsCsv(summary: TokenUsageSummary): string;
export declare function formatTokenUsageSummaryAsJson(summary: TokenUsageSummary): string;
export declare function exportTokenUsageSummary(options: TokenUsageExportOptions): Promise<string>;
export {};
