/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'node:events';
import type { Config } from '../config/config.js';
/** A single runtime sample capturing memory and CPU at a point in time. */
export interface RuntimeSample {
    ts: number;
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    /** CPU usage as a percentage of total system capacity (0–100, normalized by core count). */
    cpuPercent: number;
}
/**
 * Ring buffer that holds the most recent N runtime samples.
 * Always active for local diagnostics dumps; OTel metric reporting is
 * gated separately by `isPerformanceMonitoringActive()`.
 */
export declare class RuntimeSampleRing {
    private readonly samples;
    private prevCpuUsage;
    private prevSampleTime;
    /**
     * Record a sample. Accepts a pre-fetched memoryUsage snapshot to avoid
     * a redundant syscall when the caller already has one.
     */
    record(mem: NodeJS.MemoryUsage): RuntimeSample;
    /** Append a sample to the ring, evicting the oldest if over capacity. */
    private push;
    getAll(): RuntimeSample[];
    reset(): void;
}
export interface MemoryPressureConfig {
    /** RSS / totalmem ratio at which light cleanup begins. Default 0.50. */
    softPressureRatio: number;
    /** RSS / totalmem ratio at which moderate cleanup begins. Default 0.65. */
    hardPressureRatio: number;
    /** RSS / totalmem ratio at which aggressive cleanup begins. Default 0.80. */
    criticalRatio: number;
    /** Minimum ms between consecutive cleanups. Default 5000. */
    cleanupCooldownMs: number;
    /** Allow global.gc() in aggressive cleanup. Requires --expose-gc. */
    enableExplicitGC: boolean;
}
export interface CleanupRecommendation {
    action: 'none' | 'light' | 'moderate' | 'aggressive';
    steps: CleanupStep[];
}
export type CleanupStep = 'clear_file_cache' | 'evict_cold_cache' | 'evict_stale_cache' | 'trigger_gc' | 'compact_history';
export interface MemoryCleanupFailureEvent {
    rss: number;
    consecutiveFailures: number;
    recommendation: CleanupRecommendation;
    error: string;
}
export interface MemoryCleanupIneffectiveEvent {
    rss: number;
    freedBytes: number;
    freedRatio: number;
    consecutiveIneffectiveCleanups: number;
    recommendation: CleanupRecommendation;
}
export declare const DEFAULT_PRESSURE_CONFIG: MemoryPressureConfig;
export declare function validateMemoryPressureConfig(c: MemoryPressureConfig): void;
export declare class MemoryPressureMonitor extends EventEmitter {
    private readonly config;
    private readonly coreConfig;
    private pendingCheck;
    private cleanupInProgress;
    private hasLoggedSamplingError;
    private activeCleanupAction;
    private lastCleanupAction;
    private queuedCleanupRecommendation?;
    private lastCleanupTime;
    private consecutiveCleanupFailures;
    private consecutiveIneffectiveCleanups;
    private consecutiveIneffectiveAggressiveCleanups;
    private cleanupGeneration;
    private readonly effectiveMemoryLimit;
    private readonly diagnosticsDumper;
    private readonly runtimeSamples;
    constructor(coreConfig: Config, pressureConfig?: MemoryPressureConfig);
    getConsecutiveFailures(): number;
    resetConsecutiveFailures(): void;
    /**
     * Reset session-scoped cleanup state and invalidate any async cleanup tail
     * that was queued against the previous session's cache.
     */
    resetForNewSession(): void;
    /**
     * Schedule a deferred memory check after a tool finishes execution.
     * Uses queueMicrotask to batch checks across concurrently-completing
     * tools within the same event-loop tick.
     */
    scheduleCheck(): void;
    /** Force an immediate check (e.g. after a concurrent batch completes). */
    performCheck(): void;
    private performCheckInternal;
    /**
     * Read the current process memory usage, returning undefined (and logging)
     * if the syscall fails. Lets callers share one snapshot per check cycle.
     */
    private readMemoryUsage;
    /**
     * Determine the current memory pressure level from the stronger of:
     *  - RSS as a fraction of the effective memory limit (cgroup-aware).
     *  - V8 heap usage as a fraction of V8's heap size limit.
     *
     * @param memSnapshot Optional pre-fetched memoryUsage snapshot; when
     *   provided, avoids a redundant process.memoryUsage() syscall.
     */
    getPressureLevel(memSnapshot?: NodeJS.MemoryUsage): 'normal' | 'soft' | 'hard' | 'critical';
    private recommendCleanup;
    private executeCleanup;
    private finishCleanupAndRunQueued;
    private getCleanupCooldownMs;
    private logCleanupResult;
    private recordCleanupFailure;
    private emitSafely;
    private runCleanupSteps;
    private executeStep;
    private computeEffectiveMemoryLimit;
    private readCgroupMemoryLimit;
}
