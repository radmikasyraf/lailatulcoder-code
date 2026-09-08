/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type RetryAfterMode = 'ignore' | 'minimum';
export interface RetryDelayPolicyOptions {
    attempt: number;
    initialDelayMs: number;
    maxDelayMs: number;
    error?: unknown;
    retryAfterMode?: RetryAfterMode;
    retryAfterMaxDelayMs?: number;
    jitterRatio?: number;
    random?: () => number;
}
/**
 * Calculates a retry delay using a shared exponential-backoff policy.
 *
 * Retry-After handling depends on `retryAfterMode`:
 *   - `'ignore'` (default): do not parse Retry-After; always return the
 *     exponential delay (with optional jitter). Passing `error` alone does not
 *     enable Retry-After handling.
 *   - `'minimum'`: use Retry-After as a floor on the exponential delay.
 *
 * When Retry-After is honored, `jitterRatio` is intentionally not applied —
 * the server's wait is treated as exact.
 *
 * `retryAfterMaxDelayMs` caps the Retry-After-derived delay; defaults to
 * `maxDelayMs`.
 */
export declare function getRetryDelayMs(options: RetryDelayPolicyOptions): number;
/**
 * Extracts Retry-After from common SDK error header shapes.
 *
 * This intentionally checks both direct `error.headers` and
 * `error.response.headers`. Some SDKs surface response headers directly on the
 * thrown error, and those 429s should honor the provider-specified wait.
 */
export declare function getRetryAfterDelayMs(error: unknown): number | null;
