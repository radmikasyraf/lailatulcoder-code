/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
const DEFAULT_RESOLUTION_MS = 20;
const DEFAULT_STALL_THRESHOLD_MS = 1_000;
/**
 * Default minimum gap treated as host suspension. Kept at or below the ACP
 * bridge stall-kill threshold (`ACP_EVENT_LOOP_STALL_RESTART_MS`) so a low-CPU
 * sleep gap is always filtered before it can be reported as a kill-eligible
 * stall.
 */
export const DEFAULT_EVENT_LOOP_SUSPEND_THRESHOLD_MS = 5 * 60 * 1_000;
const DEFAULT_SUSPEND_CPU_RATIO = 0.01;
const NS_PER_MS = 1_000_000;
export function startEventLoopLagMonitor(options = {}) {
    const resolutionMs = positiveFiniteOrDefault(options.resolutionMs, DEFAULT_RESOLUTION_MS);
    const stallThresholdMs = positiveFiniteOrDefault(options.stallThresholdMs, DEFAULT_STALL_THRESHOLD_MS);
    const suspendThresholdMs = positiveFiniteOrDefault(options.suspendThresholdMs, DEFAULT_EVENT_LOOP_SUSPEND_THRESHOLD_MS);
    const suspendCpuRatio = fractionOrDefault(options.suspendCpuRatio, DEFAULT_SUSPEND_CPU_RATIO);
    const histogram = monitorEventLoopDelay({ resolution: resolutionMs });
    histogram.enable();
    let disposed = false;
    let lastReportedMaxMs = 0;
    let lastObservedMaxMs = 0;
    let lastCheckTimeMs = Date.now();
    let lastCpuUsage = safeCpuUsage();
    let pendingSuspendGapMs = 0;
    const readMaxMs = () => nsToMs(histogram.max);
    const checkHistogram = () => {
        if (disposed)
            return;
        const nowMs = Date.now();
        const cpuUsage = safeCpuUsage();
        const elapsedMs = Math.max(0, nowMs - lastCheckTimeMs);
        const maxMs = readMaxMs();
        const newMaxMs = maxMs > lastObservedMaxMs ? maxMs : 0;
        const cpuRatio = calculateCpuRatio(lastCpuUsage, cpuUsage, elapsedMs);
        lastCheckTimeMs = nowMs;
        if (cpuUsage)
            lastCpuUsage = cpuUsage;
        lastObservedMaxMs = maxMs;
        const isLowCpuGap = elapsedMs >= suspendThresholdMs &&
            cpuRatio !== undefined &&
            cpuRatio <= suspendCpuRatio;
        // The histogram's own libuv timer can land the gap one tick after ours,
        // so a low-CPU gap stays eligible for one further check.
        const suspendGapMs = isLowCpuGap ? elapsedMs : pendingSuspendGapMs;
        pendingSuspendGapMs = isLowCpuGap ? elapsedMs : 0;
        if (newMaxMs >= suspendThresholdMs &&
            suspendGapMs >= suspendThresholdMs &&
            newMaxMs <= suspendGapMs * 1.5) {
            histogram.reset();
            lastObservedMaxMs = 0;
            lastReportedMaxMs = 0;
            pendingSuspendGapMs = 0;
            return;
        }
        if (options.onNewMaxStall &&
            maxMs >= stallThresholdMs &&
            maxMs > lastReportedMaxMs) {
            lastReportedMaxMs = maxMs;
            try {
                options.onNewMaxStall(maxMs);
            }
            catch {
                /* event loop monitoring must not break the process */
            }
        }
    };
    const interval = setInterval(checkHistogram, resolutionMs);
    interval.unref();
    return {
        snapshot() {
            return {
                meanMs: nsToMs(histogram.mean),
                p50Ms: nsToMs(histogram.percentile(50)),
                p99Ms: nsToMs(histogram.percentile(99)),
                maxMs: readMaxMs(),
            };
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            clearInterval(interval);
            histogram.disable();
        },
    };
}
function safeCpuUsage() {
    try {
        return process.cpuUsage();
    }
    catch {
        return undefined;
    }
}
function calculateCpuRatio(previous, current, elapsedMs) {
    if (!previous || !current || elapsedMs <= 0)
        return undefined;
    const cpuMicroseconds = current.user - previous.user + (current.system - previous.system);
    return Math.max(0, cpuMicroseconds / (elapsedMs * 1_000));
}
function nsToMs(value) {
    return Number.isFinite(value) ? value / NS_PER_MS : 0;
}
function positiveFiniteOrDefault(value, fallback) {
    return value !== undefined && Number.isFinite(value) && value > 0
        ? value
        : fallback;
}
function fractionOrDefault(value, fallback) {
    return value !== undefined &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1
        ? value
        : fallback;
}
//# sourceMappingURL=event-loop-lag.js.map