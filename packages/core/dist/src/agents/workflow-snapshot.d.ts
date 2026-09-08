/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import type { WorkflowMeta } from './runtime/workflow-sandbox.js';
import { type WorkflowDispatchTrace, type WorkflowEvent, type WorkflowPhaseVisit, type WorkflowRunStartMode, type WorkflowTask, type WorkflowTerminalStatus } from './workflow-run-registry.js';
/** Cap on snapshots retained on disk; oldest are pruned on write. */
export declare const MAX_RETAINED_SNAPSHOTS = 30;
/** JSON-serializable projection of a terminal workflow run. */
export interface WorkflowSnapshot {
    runId: string;
    /** Human-readable fallback when a workflow has no exported meta block. */
    description?: string;
    /** Prior run used by retry or rerun. Absent on legacy snapshots. */
    sourceRunId?: string;
    /** How this run was started from sourceRunId. */
    startMode?: WorkflowRunStartMode;
    meta: WorkflowMeta | null;
    status: WorkflowTerminalStatus;
    script: string;
    scriptPath?: string;
    phases: string[];
    /** Absent on snapshots written before workflow graph tracing existed. */
    phaseVisits?: WorkflowPhaseVisit[];
    /** Absent on snapshots written before workflow graph tracing existed. */
    dispatches?: WorkflowDispatchTrace[];
    agentsDispatched: number;
    agentsCompleted: number;
    tokensSpent: number;
    tokenBudgetTotal: number | null;
    /** `perPhaseTokens` flattened to `[phaseOrNull, tokens]` pairs. */
    perPhaseTokens: Array<[string | null, number]>;
    recentLogs: string[];
    /** Absent on snapshots written before runtime event tracing existed. */
    events?: WorkflowEvent[];
    startTime: number;
    endTime?: number;
    result?: unknown;
    error?: string;
}
/** Project a (terminal) registry entry into a serializable snapshot. */
export declare function toSnapshot(task: WorkflowTask): WorkflowSnapshot;
/**
 * Write a run snapshot to `<projectDir>/workflows/<runId>.json`, then prune
 * the oldest snapshots beyond `MAX_RETAINED_SNAPSHOTS`. Best-effort: a write
 * failure is logged, not thrown (persistence is a convenience, not a
 * correctness requirement).
 */
export declare function writeWorkflowSnapshot(config: Config, task: WorkflowTask): Promise<void>;
/**
 * Load all persisted snapshots, newest-first by `startTime`. Tolerates a
 * missing directory and skips unparseable files.
 */
export declare function listWorkflowSnapshots(config: Config): Promise<WorkflowSnapshot[]>;
/**
 * Delete one persisted run summary and its resume journal. The run id must be
 * a well-formed workflow run id because both targets live below the project
 * runs dir.
 * Returns true when the safe target is absent after this call.
 */
export declare function deleteWorkflowSnapshot(config: Config, runId: string): Promise<boolean>;
