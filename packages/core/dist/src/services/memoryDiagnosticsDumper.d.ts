/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import type { RuntimeSample } from './memoryPressureMonitor.js';
export interface MemoryDumpResult {
    filePath: string;
    trigger: string;
}
export declare class MemoryDiagnosticsDumper {
    private readonly config;
    private dumpCount;
    private lastDumpTime;
    constructor(config: Config);
    /**
     * Resets session-scoped state. Called when a new session starts.
     */
    resetForNewSession(): void;
    /**
     * Writes a diagnostics snapshot to disk if within per-session limits.
     *
     * Uses a two-phase write strategy:
     * - Phase 1 (synchronous): writes a minimal JSON with process.memoryUsage()
     *   and v8.getHeapStatistics() — no fork/exec, so it lands on disk even
     *   under extreme memory pressure.
     * - Phase 2 (async): collects full diagnostics (may spawn subprocesses)
     *   and overwrites the file with the complete payload. If Phase 2 crashes,
     *   Phase 1's file still survives for debugging.
     *
     * Slot is reserved synchronously before any await to prevent concurrent
     * invocations from bypassing the cap/cooldown guards.
     */
    dump(trigger: 'hard' | 'critical', recentSamples?: RuntimeSample[]): Promise<MemoryDumpResult | undefined>;
    private ensureDiagnosticsDir;
    private collectSessionStats;
    private getSuggestion;
}
