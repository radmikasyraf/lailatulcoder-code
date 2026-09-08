/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenerateContentResponse } from '@google/genai';
export interface HttpError extends Error {
    status?: number;
}
export interface HeartbeatInfo {
    attempt: number;
    remainingMs: number;
    error: unknown;
}
/**
 * Information passed to `RetryOptions.onRetry` after each failed attempt.
 * Lets callers (LLM call sites) emit `ApiRetryEvent` telemetry without
 * coupling `retry.ts` to telemetry concerns.
 */
export interface RetryAttemptInfo {
    /**
     * 1-based monotonic iteration counter — same value as ALS context's `attempt`.
     */
    attempt: number;
    error: unknown;
    errorStatus?: number;
    /** Computed backoff delay that follows this failed attempt (ms). */
    delayMs: number;
}
export interface RetryOptions {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    shouldRetryOnError: (error: Error) => boolean;
    shouldRetryOnContent?: (content: GenerateContentResponse) => boolean;
    authType?: string;
    extraRetryErrorCodes?: readonly number[];
    persistentMode?: boolean;
    persistentMaxBackoffMs?: number;
    persistentCapMs?: number;
    heartbeatIntervalMs?: number;
    heartbeatFn?: (info: HeartbeatInfo) => void;
    signal?: AbortSignal;
    /**
     * Optional. Called once per failed attempt after the backoff delay is
     * computed but BEFORE the sleep. Use this to emit retry telemetry events
     * (e.g. `ApiRetryEvent` for LLM call sites); leave undefined for non-LLM
     * callers so they stay silent in LLM-specific telemetry channels.
     *
     * Contract:
     * - Invoked only after `await fn()` rejects in the catch block of
     *   `retryWithBackoff` (OUTSIDE the `retryContext.run()` ALS frame).
     *   This is true for both synchronous and asynchronous throws from `fn`.
     *   All retry-context data is passed via the `RetryAttemptInfo` parameter
     *   — do NOT read `retryContext.getStore()` inside an `onRetry` callback.
     * - Content-retries via `shouldRetryOnContent` do NOT fire `onRetry`.
     *   If a future caller wires content retries, extend `retry.ts` to fire
     *   `onRetry` on that path too.
     * - Callback errors are swallowed and logged via `debugLogger.warn`; they
     *   never affect retry behavior (best-effort telemetry).
     */
    onRetry?: (info: RetryAttemptInfo) => void;
}
/**
 * Determines if an error is a transient capacity error eligible for persistent retry.
 * Only 429 (Rate Limit) and 529 (Overloaded) qualify — HTTP 500 is excluded
 * because it may indicate a permanent server bug.
 */
export declare function isTransientCapacityError(error: unknown): boolean;
/**
 * Detects whether persistent retry mode is explicitly enabled.
 * Requires the user to opt in via QWEN_CODE_UNATTENDED_RETRY — we intentionally
 * do NOT auto-activate on CI=true, because silently turning a fast-fail CI job
 * into an infinite-wait job would be surprising and dangerous.
 */
export declare function isUnattendedMode(): boolean;
/**
 * Delays execution for a specified number of milliseconds.
 * @param ms The number of milliseconds to delay.
 * @param signal Optional signal used to abort the delay.
 * @returns A promise that resolves after the delay.
 */
export declare function delay(ms: number, signal?: AbortSignal): Promise<void>;
/**
 * Retries a function with exponential backoff and jitter.
 * Supports persistent retry mode for unattended/CI environments where transient
 * capacity errors (429/529) should be retried indefinitely rather than failing.
 * @param fn The asynchronous function to retry.
 * @param options Optional retry configuration.
 * @returns A promise that resolves with the result of the function if successful.
 * @throws The last error encountered if all attempts fail.
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
