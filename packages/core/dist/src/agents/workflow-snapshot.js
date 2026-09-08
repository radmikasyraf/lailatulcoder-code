/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Persisted snapshots of completed workflow runs. The
 * `WorkflowRunRegistry` is in-memory and dies with the CLI process; a
 * snapshot written to `<projectDir>/workflows/<runId>.json` on terminal
 * transition lets `/workflows` show a "recent" history that survives a
 * restart. This is independent of the resume journal (which is per-agent,
 * for caching): a snapshot is the whole-run summary.
 */
import { promises as fs } from 'node:fs';
import { createDebugLogger } from '../utils/debugLogger.js';
import { isTerminalWorkflowStatus, } from './workflow-run-registry.js';
const debugLogger = createDebugLogger('WORKFLOW_SNAPSHOT');
/** Cap on snapshots retained on disk; oldest are pruned on write. */
export const MAX_RETAINED_SNAPSHOTS = 30;
/** Project a (terminal) registry entry into a serializable snapshot. */
export function toSnapshot(task) {
    if (!isTerminalWorkflowStatus(task.status)) {
        throw new Error(`Cannot snapshot active workflow ${task.runId}.`);
    }
    return {
        runId: task.runId,
        description: task.description,
        sourceRunId: task.sourceRunId,
        startMode: task.startMode,
        meta: task.meta,
        status: task.status,
        script: task.script ?? '',
        scriptPath: task.scriptPath,
        phases: [...task.phases],
        phaseVisits: task.phaseVisits.map((visit) => ({ ...visit })),
        dispatches: task.dispatches.map((dispatch) => ({
            ...dispatch,
            dependsOn: [...dispatch.dependsOn],
        })),
        agentsDispatched: task.agentsDispatched,
        agentsCompleted: task.agentsCompleted,
        tokensSpent: task.tokensSpent,
        tokenBudgetTotal: task.tokenBudgetTotal,
        perPhaseTokens: Array.from(task.perPhaseTokens.entries()),
        recentLogs: [...task.recentLogs],
        events: task.events.map((event) => ({ ...event })),
        startTime: task.startTime,
        endTime: task.endTime,
        result: safeResult(task.result),
        error: task.error,
    };
}
/** A non-JSON-serializable result is replaced with a placeholder string. */
function safeResult(result) {
    if (result === undefined)
        return undefined;
    try {
        JSON.stringify(result);
        return result;
    }
    catch {
        return `(non-JSON-serializable ${typeof result})`;
    }
}
/**
 * Write a run snapshot to `<projectDir>/workflows/<runId>.json`, then prune
 * the oldest snapshots beyond `MAX_RETAINED_SNAPSHOTS`. Best-effort: a write
 * failure is logged, not thrown (persistence is a convenience, not a
 * correctness requirement).
 */
export async function writeWorkflowSnapshot(config, task) {
    const storage = config.storage;
    if (!storage)
        return;
    try {
        // Project BEFORE the first await: the caller captures this at
        // settlement, but in-flight dispatches keep mutating the live
        // entry across the fs awaits below — a post-await projection
        // froze the snapshot at an fs-timing-dependent point mid-drain.
        const snapshot = toSnapshot(task);
        const dir = storage.getWorkflowRunsDir();
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(storage.getWorkflowRunSnapshotPath(task.runId), JSON.stringify(snapshot, null, 2), 'utf8');
        await pruneSnapshots(dir);
    }
    catch (e) {
        debugLogger.warn(`writeWorkflowSnapshot failed for ${task.runId}: ${e}`);
    }
}
/**
 * Load all persisted snapshots, newest-first by `startTime`. Tolerates a
 * missing directory and skips unparseable files.
 */
export async function listWorkflowSnapshots(config) {
    const storage = config.storage;
    if (!storage)
        return [];
    const dir = storage.getWorkflowRunsDir();
    let files;
    try {
        files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    }
    catch {
        return [];
    }
    const snapshots = [];
    for (const file of files) {
        try {
            const raw = await fs.readFile(`${dir}/${file}`, 'utf8');
            const parsed = JSON.parse(raw);
            if (!isWorkflowSnapshot(parsed)) {
                debugLogger.warn(`skipping invalid workflow snapshot ${file}`);
                continue;
            }
            snapshots.push(parsed);
        }
        catch (e) {
            debugLogger.warn(`skipping unparseable snapshot ${file}: ${e}`);
        }
    }
    snapshots.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
    return snapshots;
}
/**
 * Delete one persisted run summary and its resume journal. The run id must be
 * a well-formed workflow run id because both targets live below the project
 * runs dir.
 * Returns true when the safe target is absent after this call.
 */
export async function deleteWorkflowSnapshot(config, runId) {
    const storage = config.storage;
    if (!storage || !/^wf_[0-9a-f]+$/.test(runId))
        return false;
    try {
        await fs.rm(`${storage.getWorkflowRunsDir()}/${runId}`, {
            recursive: true,
            force: true,
        });
    }
    catch (error) {
        debugLogger.warn(`delete workflow journal failed for ${runId}: ${error}`);
        return false;
    }
    try {
        await fs.unlink(storage.getWorkflowRunSnapshotPath(runId));
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            debugLogger.warn(`deleteWorkflowSnapshot failed for ${runId}: ${error}`);
            return false;
        }
    }
    return true;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function isOptionalString(value) {
    return value === undefined || typeof value === 'string';
}
function isStringArray(value) {
    return (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}
function isWorkflowMeta(value) {
    if (value === null)
        return true;
    if (!isRecord(value))
        return false;
    if (typeof value['name'] !== 'string' ||
        typeof value['description'] !== 'string' ||
        !isOptionalString(value['whenToUse'])) {
        return false;
    }
    const phases = value['phases'];
    return (phases === undefined ||
        (Array.isArray(phases) &&
            phases.every((phase) => isRecord(phase) &&
                typeof phase['title'] === 'string' &&
                isOptionalString(phase['detail']) &&
                isOptionalString(phase['model']))));
}
function isWorkflowPhaseVisit(value) {
    return (isRecord(value) &&
        typeof value['id'] === 'string' &&
        isFiniteNumber(value['index']) &&
        typeof value['title'] === 'string' &&
        isFiniteNumber(value['startedAt']) &&
        (value['endedAt'] === undefined || isFiniteNumber(value['endedAt'])));
}
function isWorkflowDispatch(value) {
    if (!isRecord(value))
        return false;
    const status = value['status'];
    return (typeof value['id'] === 'string' &&
        (value['phaseVisitId'] === null ||
            typeof value['phaseVisitId'] === 'string') &&
        typeof value['label'] === 'string' &&
        typeof value['prompt'] === 'string' &&
        isOptionalString(value['subagentId']) &&
        (status === 'queued' ||
            status === 'running' ||
            status === 'completed' ||
            status === 'failed' ||
            status === 'cancelled' ||
            status === 'cached') &&
        isStringArray(value['dependsOn']) &&
        isFiniteNumber(value['queuedAt']) &&
        (value['startedAt'] === undefined || isFiniteNumber(value['startedAt'])) &&
        (value['endedAt'] === undefined || isFiniteNumber(value['endedAt'])) &&
        isOptionalString(value['error']));
}
function hasOnlyKeys(value, keys) {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
}
function isWorkflowEvent(value) {
    if (!isRecord(value) ||
        typeof value['id'] !== 'string' ||
        !isFiniteNumber(value['at']) ||
        typeof value['type'] !== 'string') {
        return false;
    }
    const base = ['id', 'type', 'at'];
    switch (value['type']) {
        case 'phase-started':
            return (hasOnlyKeys(value, [...base, 'phaseVisitId', 'title']) &&
                typeof value['phaseVisitId'] === 'string' &&
                typeof value['title'] === 'string');
        case 'phase-completed':
            return (hasOnlyKeys(value, [...base, 'phaseVisitId']) &&
                typeof value['phaseVisitId'] === 'string');
        case 'dispatch-queued':
        case 'dispatch-started':
        case 'dispatch-completed':
        case 'dispatch-cancelled':
        case 'dispatch-cached':
            return (hasOnlyKeys(value, [...base, 'dispatchId']) &&
                typeof value['dispatchId'] === 'string');
        case 'dispatch-failed':
            return (hasOnlyKeys(value, [...base, 'dispatchId', 'error']) &&
                typeof value['dispatchId'] === 'string' &&
                typeof value['error'] === 'string');
        case 'log':
            return (hasOnlyKeys(value, [...base, 'message']) &&
                typeof value['message'] === 'string');
        case 'approval-requested':
        case 'approval-settled':
            return (hasOnlyKeys(value, [...base, 'name', 'dispatchId']) &&
                typeof value['name'] === 'string' &&
                isOptionalString(value['dispatchId']));
        case 'workflow-completed':
        case 'workflow-cancelled':
            return hasOnlyKeys(value, base);
        case 'workflow-failed':
            return (hasOnlyKeys(value, [...base, 'error']) &&
                typeof value['error'] === 'string');
        default:
            return false;
    }
}
function isWorkflowSnapshot(value) {
    if (!isRecord(value))
        return false;
    const status = value['status'];
    const phaseVisits = value['phaseVisits'];
    const dispatches = value['dispatches'];
    const events = value['events'];
    const perPhaseTokens = value['perPhaseTokens'];
    return (typeof value['runId'] === 'string' &&
        value['runId'].length > 0 &&
        isOptionalString(value['description']) &&
        isOptionalString(value['sourceRunId']) &&
        (value['startMode'] === undefined ||
            value['startMode'] === 'retry' ||
            value['startMode'] === 'rerun') &&
        isWorkflowMeta(value['meta']) &&
        (status === 'completed' || status === 'failed' || status === 'cancelled') &&
        typeof value['script'] === 'string' &&
        isOptionalString(value['scriptPath']) &&
        isStringArray(value['phases']) &&
        (phaseVisits === undefined ||
            (Array.isArray(phaseVisits) &&
                phaseVisits.every(isWorkflowPhaseVisit))) &&
        (dispatches === undefined ||
            (Array.isArray(dispatches) && dispatches.every(isWorkflowDispatch))) &&
        (events === undefined ||
            (Array.isArray(events) && events.every(isWorkflowEvent))) &&
        isFiniteNumber(value['agentsDispatched']) &&
        isFiniteNumber(value['agentsCompleted']) &&
        isFiniteNumber(value['tokensSpent']) &&
        (value['tokenBudgetTotal'] === null ||
            isFiniteNumber(value['tokenBudgetTotal'])) &&
        Array.isArray(perPhaseTokens) &&
        perPhaseTokens.every((entry) => Array.isArray(entry) &&
            entry.length === 2 &&
            (entry[0] === null || typeof entry[0] === 'string') &&
            isFiniteNumber(entry[1])) &&
        isStringArray(value['recentLogs']) &&
        isFiniteNumber(value['startTime']) &&
        (value['endTime'] === undefined || isFiniteNumber(value['endTime'])) &&
        isOptionalString(value['error']));
}
/** Remove the oldest snapshots beyond the retention cap. */
async function pruneSnapshots(dir) {
    let files;
    try {
        files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    }
    catch {
        return;
    }
    if (files.length <= MAX_RETAINED_SNAPSHOTS)
        return;
    // Sort by mtime ascending (oldest first) and unlink the overflow.
    const stats = await Promise.all(files.map(async (f) => {
        try {
            const s = await fs.stat(`${dir}/${f}`);
            return { f, mtime: s.mtimeMs };
        }
        catch {
            return { f, mtime: 0 };
        }
    }));
    stats.sort((a, b) => a.mtime - b.mtime);
    const toPrune = stats.slice(0, stats.length - MAX_RETAINED_SNAPSHOTS);
    await Promise.all(toPrune.map((s) => {
        // Each run also has a sibling `<runId>/journal.jsonl` directory (the
        // resume journal). Removing only the `<runId>.json` snapshot would leave
        // those journal dirs to grow without bound, so prune both together.
        const runId = s.f.replace(/\.json$/, '');
        // ...but gate the recursive delete on a well-formed run id. The list is a
        // plain `.json` glob, so a file named `...json` yields `runId = ".."` and
        // `fs.rm(`${dir}/..`, {recursive,force})` would delete the runs dir's
        // PARENT; `notarun.json` would delete a sibling `notarun/`. A malicious
        // repo could ship such a file and trip it once pruning kicks in. Only the
        // generated `wf_<hex>` shape (mirrors workflow.ts's resumeFromRunId guard)
        // may drive `fs.rm`. The `.json` unlink stays unconditional — it removes
        // exactly that one file, never a directory.
        const isRunDir = /^wf_[0-9a-f]+$/.test(runId);
        return Promise.all([
            fs
                .unlink(`${dir}/${s.f}`)
                .catch((e) => debugLogger.warn(`prune unlink failed for ${s.f}: ${e}`)),
            ...(isRunDir
                ? [
                    fs
                        .rm(`${dir}/${runId}`, { recursive: true, force: true })
                        .catch((e) => debugLogger.warn(`prune journal dir failed for ${runId}: ${e}`)),
                ]
                : []),
        ]);
    }));
}
//# sourceMappingURL=workflow-snapshot.js.map