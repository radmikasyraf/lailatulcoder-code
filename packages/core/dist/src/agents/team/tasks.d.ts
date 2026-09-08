/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SwarmTask, SwarmTaskStatus } from './types.js';
/**
 * Sentinel `callerName` for internal reciprocal edge-mirror writes
 * (task-update.ts mirrors `A.blocks=[B]` into `B.blockedBy=[A]`). These
 * must bypass the ownership guard to keep the dependency graph
 * consistent; passing this sentinel instead of an empty `callerName`
 * makes the intentional bypass greppable in logs. It can never collide
 * with a real teammate identity — agent names are sanitized to
 * `[a-z0-9-]`, so the underscores can't appear in one.
 */
export declare const RECIPROCAL_CALLER = "__reciprocal__";
/**
 * Validate a task ID. Task IDs are auto-generated as positive
 * integers by `createTask`; rejecting anything else prevents
 * model-supplied IDs from escaping the tasks directory via
 * `../` segments or absolute paths.
 */
export declare function assertValidTaskId(taskId: string): void;
/** Path to a single task file. */
export declare function getTaskPath(teamName: string, taskId: string): string;
type TaskUpdateListener = (teamName: string) => void;
/**
 * Register a listener for task updates (any create/update/delete).
 * Returns an unsubscribe function.
 */
export declare function onTasksUpdated(listener: TaskUpdateListener): () => void;
/** Notify all listeners that tasks have changed. */
export declare function notifyTasksUpdated(teamName: string): void;
/**
 * Create a new task. Auto-increments the ID based on existing
 * task files (high water mark + 1).
 */
export declare function createTask(teamName: string, opts: {
    subject: string;
    description: string;
    activeForm?: string;
    owner?: string;
    metadata?: Record<string, unknown>;
}): Promise<SwarmTask>;
/**
 * Read a single task by ID.
 * Returns undefined if the task doesn't exist.
 */
export declare function getTask(teamName: string, taskId: string): Promise<SwarmTask | undefined>;
/**
 * Thrown by `updateTask` when a teammate caller's ownership-restricted
 * update would mutate a task already owned by a different teammate.
 *
 * The check is performed inside the per-task lock so two teammates
 * racing to claim the same pending task can't both succeed: the second
 * write sees the first one's owner and rejects rather than silently
 * overwriting it.
 */
export declare class TaskOwnershipError extends Error {
    readonly taskId: string;
    readonly callerName: string;
    readonly actualOwner: string;
    constructor(taskId: string, callerName: string, actualOwner: string);
}
/**
 * Update fields on an existing task.
 * Uses file locking for safe concurrent updates.
 * Returns the updated task, or undefined if not found.
 *
 * `opts.callerName`, when set, identifies a teammate caller. The
 * update is then rejected with `TaskOwnershipError` if the task's
 * existing owner is set to a different teammate. The check happens
 * inside the lock — without that, two teammates can both pass a
 * pre-lock guard on an unowned task and have the second writer
 * silently overwrite the first one's claim.
 */
export declare function updateTask(teamName: string, taskId: string, updates: {
    status?: SwarmTaskStatus;
    owner?: string | null;
    subject?: string;
    description?: string;
    activeForm?: string | null;
    metadata?: Record<string, unknown>;
    addBlocks?: string[];
    addBlockedBy?: string[];
}, opts?: {
    callerName?: string;
}): Promise<SwarmTask | undefined>;
/**
 * Delete a task file.
 *
 * Acquires the same per-task lock that `updateTask` uses, then
 * re-reads and re-checks ownership *inside* the lock before unlinking.
 * Doing the check under the lock closes a TOCTOU hole: a pre-lock read
 * could pass the ownership guard, then a concurrent `claimTask` /
 * `updateTask` reassign the owner before the unlink, and we'd silently
 * destroy a task that now belongs to a different teammate. Holding the
 * lock also stops a concurrent read-modify-write cycle from writing
 * back to a path we just unlinked (which would resurrect the task with
 * stale data). Lock-acquisition / read failures with ENOENT are treated
 * as already-deleted.
 *
 * Reciprocal dependency edges are cleaned up *after* the file is
 * unlinked and this task's lock is released — never holding two
 * per-task locks at once, which would risk deadlock against a
 * concurrent multi-task update that locks in the opposite order — but
 * before the single tasks-updated notification fires, so no listener
 * observes a dependent still blocked by the phantom id. Without this,
 * deleting a task X that appears in another task's `blockedBy` would
 * leave the deleted id in that neighbor, and `tryAutoClaimTask` skips
 * any task with a non-empty `blockedBy`, so a dependent would become
 * unclaimable forever.
 */
export declare function deleteTask(teamName: string, taskId: string, opts?: {
    callerName?: string;
}): Promise<boolean>;
/**
 * List all tasks for a team, optionally filtered.
 */
export declare function listTasks(teamName: string, filters?: {
    status?: SwarmTaskStatus;
    owner?: string;
    blockedBy?: string;
}): Promise<SwarmTask[]>;
/**
 * Delete all tasks for a team (reset the task list).
 */
export declare function resetTaskList(teamName: string): Promise<void>;
/**
 * Add a blocking relationship: `fromId` blocks `toId`.
 * Updates both task files.
 */
export declare function blockTask(teamName: string, fromId: string, toId: string): Promise<void>;
/**
 * Claim a pending task for an agent.
 * Sets owner and transitions to in_progress.
 * Returns the claimed task, or undefined if already claimed
 * or not found.
 */
export declare function claimTask(teamName: string, taskId: string, agentId: string, opts?: {
    checkAgentBusy?: boolean;
    ownerName?: string;
}): Promise<SwarmTask | undefined>;
/**
 * Atomically release one task owned by a terminating agent.
 * Re-reads under the per-task lock and gives up when the caller's
 * snapshot went stale: the leader may have reassigned the task to
 * another teammate, or the dying agent's final task_update
 * (completion) may have landed after the snapshot read. Releasing
 * in either case would clobber the newer write — yanking the task
 * from its new owner or resurrecting a completed task as pending.
 * Returns true when the task was reset to pending.
 */
export declare function releaseOwnedTask(teamName: string, taskId: string, expectedOwner: string): Promise<boolean>;
/**
 * Unassign all tasks owned by an agent (set back to pending).
 * Used when an agent crashes or is shut down.
 */
export declare function unassignTeammateTasks(teamName: string, agentId: string): Promise<number>;
/**
 * Get a summary of each agent's task status.
 */
export declare function getAgentStatuses(teamName: string): Promise<Map<string, {
    inProgress: number;
    completed: number;
}>>;
export {};
