/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export type CpuProfileStartResult = {
    ok: true;
} | {
    ok: false;
    error: string;
};
export type CpuProfileStopResult = {
    ok: true;
    filePath: string;
} | {
    ok: false;
    error: string;
};
interface InspectorSession {
    connect(): void;
    disconnect(): void;
    post(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
/**
 * Initialize CPU profiler. Call once at process start.
 * Always registers SIGUSR1 handler (for ad-hoc profiling).
 * When QWEN_CODE_CPU_PROFILE=1, also starts recording immediately.
 */
export declare function initCpuProfiler(): void;
/**
 * Start CPU profiling.
 * @param opts.samplingInterval - Sampling interval in microseconds (default 1000 = 1ms)
 */
export declare function startCpuProfile(opts?: {
    samplingInterval?: number;
}): Promise<CpuProfileStartResult>;
/**
 * Stop CPU profiling and write the .cpuprofile file.
 * @returns File path on success.
 */
export declare function stopCpuProfile(options?: {
    outputDir?: string;
    now?: Date;
    rateLimitMs?: number;
    maxProfiles?: number;
}): Promise<CpuProfileStopResult>;
/**
 * Whether the profiler is currently recording.
 */
export declare function isCpuProfileRecording(): boolean;
/**
 * Register SIGUSR1 signal handler for toggle mode.
 * Safe to call multiple times; only registers once.
 * No-op on Windows (SIGUSR1 does not exist).
 */
export declare function registerSignalHandler(): void;
/** Reset all module state. Test-only. */
export declare function _resetCpuProfilerForTest(): void;
/** Clear rate limit state. Test-only. */
export declare function clearCpuProfileRateLimit(): void;
/** Override session creation for testing. */
export declare function _setSessionFactoryForTest(factory: (() => Promise<InspectorSession>) | null): void;
export {};
