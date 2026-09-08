/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { aggregateUsage, getTimeRangeBounds, loadUsageHistoryWithLive, } from './usageHistoryService.js';
import { createDebugLogger } from '../utils/debugLogger.js';
const debugLogger = createDebugLogger('USAGE_DASHBOARD');
/** Trailing window for the heatmap, ~6 months. */
const DEFAULT_HEATMAP_DAYS = 183;
/** Cap on the per-day series length (guards a wide `range` like `all`). */
const MAX_DAILY_DAYS = 92;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function modelTokens(m) {
    return m.totalTokens || m.inputTokens + m.outputTokens + m.thoughtsTokens;
}
function localDateKey(ts) {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function startOfLocalDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d;
}
function buildHeatmap(records, startMs, endMs) {
    const tokensByDay = new Map();
    const inputByDay = new Map();
    const cachedByDay = new Map();
    for (const r of records) {
        if (r.timestamp < startMs || r.timestamp > endMs)
            continue;
        if (!r.models)
            continue;
        const key = localDateKey(r.timestamp);
        let tokens = 0;
        let input = 0;
        let cached = 0;
        for (const m of Object.values(r.models)) {
            tokens += modelTokens(m);
            input += m.inputTokens;
            cached += m.cachedTokens;
        }
        tokensByDay.set(key, (tokensByDay.get(key) ?? 0) + tokens);
        inputByDay.set(key, (inputByDay.get(key) ?? 0) + input);
        cachedByDay.set(key, (cachedByDay.get(key) ?? 0) + cached);
    }
    const heatmap = {};
    for (const [key, tokens] of tokensByDay) {
        const input = inputByDay.get(key) ?? 0;
        const cached = cachedByDay.get(key) ?? 0;
        heatmap[key] = { tokens, cacheReadRate: input > 0 ? cached / input : 0 };
    }
    return heatmap;
}
/**
 * Per-day tokens + session counts over `[startMs, endMs]`, on a continuous day
 * axis (zero-filled) so the daily line/bar charts have no gaps.
 */
function buildDaily(records, startMs, endMs) {
    const tokenByDay = new Map();
    const sessionByDay = new Map();
    for (const r of records) {
        if (r.timestamp < startMs || r.timestamp > endMs)
            continue;
        const key = localDateKey(r.timestamp);
        let tokens = 0;
        if (r.models) {
            for (const m of Object.values(r.models))
                tokens += modelTokens(m);
        }
        tokenByDay.set(key, (tokenByDay.get(key) ?? 0) + tokens);
        sessionByDay.set(key, (sessionByDay.get(key) ?? 0) + 1);
    }
    const out = [];
    const cursor = startOfLocalDay(startMs);
    const last = startOfLocalDay(endMs).getTime();
    // Advance by calendar day (DST-safe) rather than fixed ms steps.
    while (cursor.getTime() <= last) {
        const key = localDateKey(cursor.getTime());
        out.push({
            date: key,
            tokens: tokenByDay.get(key) ?? 0,
            sessions: sessionByDay.get(key) ?? 0,
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return out;
}
/**
 * Build the dashboard from already-loaded usage records (pure — no I/O). Split
 * out from {@link loadUsageDashboard} so a caller can load the history once and
 * cheaply re-aggregate across ranges (the Today/7D/30D toggle) rather than
 * re-reading the whole history per range.
 */
export function buildUsageDashboard(records, options = {}) {
    const range = options.range ?? 'today';
    const heatmapDays = options.heatmapDays && options.heatmapDays > 0
        ? Math.floor(options.heatmapDays)
        : DEFAULT_HEATMAP_DAYS;
    const report = aggregateUsage(records, range);
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let thoughtsTokens = 0;
    let totalTokens = 0;
    for (const m of Object.values(report.models)) {
        inputTokens += m.inputTokens;
        outputTokens += m.outputTokens;
        cachedTokens += m.cachedTokens;
        thoughtsTokens += m.thoughtsTokens;
        totalTokens += modelTokens(m);
    }
    const summary = {
        totalTokens,
        inputTokens,
        outputTokens,
        cachedTokens,
        thoughtsTokens,
        requests: report.totalRequests,
        sessions: report.sessionCount,
        toolCalls: report.tools.totalCalls,
        linesAdded: report.files.linesAdded,
        linesRemoved: report.files.linesRemoved,
        cacheReadRate: inputTokens > 0 ? cachedTokens / inputTokens : 0,
    };
    const now = Date.now();
    const models = Object.entries(report.models)
        .map(([model, m]) => ({
        model,
        totalTokens: modelTokens(m),
        cacheReadRate: m.inputTokens > 0 ? m.cachedTokens / m.inputTokens : 0,
        share: totalTokens > 0 ? modelTokens(m) / totalTokens : 0,
    }))
        .sort((a, b) => b.totalTokens - a.totalTokens);
    const skills = report.skills.topSkills.map((s) => ({
        name: s.name,
        count: s.count,
    }));
    const dailyStart = Math.max(getTimeRangeBounds(range).start.getTime(), now - MAX_DAILY_DAYS * MS_PER_DAY);
    const daily = buildDaily(records, dailyStart, now);
    // The heatmap covers the trailing `heatmapDays` (~12 months in the UI),
    // independent of `range`.
    const heatmap = buildHeatmap(records, now - heatmapDays * MS_PER_DAY, now);
    debugLogger.debug(`built dashboard range=${range} records=${records.length} models=${models.length} skills=${skills.length} dailyPoints=${daily.length}`);
    return {
        generatedAt: new Date(now).toISOString(),
        range,
        summary,
        models,
        skills,
        daily,
        heatmap,
        heatmapDays,
    };
}
/**
 * Read-only snapshot of local token usage for the daemon usage-dashboard API.
 * Loads the global cross-project history (`~/.lailatulcoder`) via
 * {@link loadUsageHistoryWithLive} — the persisted `usage_record.jsonl` unioned
 * with a replay of recent transcripts — so the totals include daemon / Web Shell
 * and in-progress sessions that the persisted file never captures. The load can
 * be I/O heavy on large histories, so callers should cache (the daemon route
 * caches the loaded records and re-runs {@link buildUsageDashboard} per range).
 */
export async function loadUsageDashboard(options = {}) {
    return buildUsageDashboard(await loadUsageHistoryWithLive(), options);
}
//# sourceMappingURL=usage-dashboard-service.js.map