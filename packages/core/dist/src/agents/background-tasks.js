/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview BackgroundTaskRegistry — tracks background (async) sub-agents
 * and, with `isBackgrounded: false`, the currently-running synchronous
 * sub-agents whose UI is routed through the same pill+dialog while the
 * parent turn waits on them. Both share the registry (and the dialog
 * wiring) but differ in lifecycle:
 *
 * - `isBackgrounded: true` entries persist across turns, emit a
 *   `<task-notification>` on terminal status (the parent's only return
 *   channel), and contribute to `hasUnfinalizedTasks()` so headless callers
 *   keep their loop alive.
 * - `isBackgrounded: false` entries live for the duration of the parent's
 *   tool-call, are unregistered as soon as `execute()` returns, deliver
 *   their result through the normal tool-result channel (no XML envelope),
 *   and don't participate in the headless holdback.
 */
import { ToolConfirmationOutcome } from '../tools/tools.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { parsePositiveIntegerEnv } from '../utils/env.js';
import { todoWorkChainContext } from '../utils/promptIdContext.js';
import { escapeXml } from '../utils/xml.js';
import { patchAgentMeta } from './agent-transcript.js';
import { runOutsideAgentContext } from './runtime/agent-context.js';
import { AgentEventType, } from './runtime/agent-events.js';
const debugLogger = createDebugLogger('BACKGROUND_TASKS');
const MAX_DESCRIPTION_LENGTH = 40;
/**
 * Cap on each agent's rolling `recentActivities` buffer. Exported so UI
 * consumers that render the buffer (e.g. the detail dialog's Progress
 * section) can bound their display to the same value instead of
 * hardcoding a coincidentally-equal number.
 */
export const MAX_RECENT_ACTIVITIES = 10;
export const DEFAULT_MAX_CONCURRENT_BACKGROUND_AGENTS = 10;
export const BACKGROUND_AGENT_CONCURRENCY_ENV = 'QWEN_CODE_MAX_BACKGROUND_AGENTS';
function normalizeBackgroundApprovalOutcome(outcome, confirmationDetails) {
    if (outcome === ToolConfirmationOutcome.ProceedAlways ||
        outcome === ToolConfirmationOutcome.ProceedAlwaysProject ||
        outcome === ToolConfirmationOutcome.ProceedAlwaysUser ||
        outcome === ToolConfirmationOutcome.ProceedAlwaysServer ||
        outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
        if (confirmationDetails.type === 'plan' &&
            outcome === ToolConfirmationOutcome.ProceedAlways) {
            return outcome;
        }
        return ToolConfirmationOutcome.Cancel;
    }
    return outcome;
}
export function resolveMaxConcurrentBackgroundAgents(env = process.env) {
    const raw = env[BACKGROUND_AGENT_CONCURRENCY_ENV];
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_MAX_CONCURRENT_BACKGROUND_AGENTS;
    }
    // Parse through the shared helper so only plain decimal integers are
    // accepted; Number() alone would let "0x10"/"1e2"/"1.0" slip through.
    const parsed = parsePositiveIntegerEnv(raw, 0);
    if (parsed < 1) {
        debugLogger.warn(`Invalid ${BACKGROUND_AGENT_CONCURRENCY_ENV}=${JSON.stringify(raw)}, ` +
            `using default (${DEFAULT_MAX_CONCURRENT_BACKGROUND_AGENTS})`);
        return DEFAULT_MAX_CONCURRENT_BACKGROUND_AGENTS;
    }
    return parsed;
}
export const MAX_CONCURRENT_BACKGROUND_AGENTS = resolveMaxConcurrentBackgroundAgents();
/**
 * Normalize the `agents.maxParallelAgentsByModel` setting into a clean
 * model-ID → cap map. Drops entries whose key is blank or whose value is not
 * a positive integer (mirrors the validation the global cap goes through) so
 * a malformed settings file degrades to "no per-model cap" rather than
 * throwing at construction.
 */
function normalizePerModelConcurrency(raw) {
    const result = new Map();
    if (!raw) {
        return result;
    }
    const entries = raw instanceof Map ? raw.entries() : Object.entries(raw);
    for (const [model, value] of entries) {
        const key = model?.trim();
        if (!key) {
            continue;
        }
        if (!Number.isInteger(value) || value < 1) {
            debugLogger.warn(`Invalid maxParallelAgentsByModel[${JSON.stringify(model)}]=` +
                `${JSON.stringify(value)}; ignoring (must be a positive integer).`);
            continue;
        }
        result.set(key, value);
    }
    return result;
}
/**
 * Cap on how many fully-finalized terminal entries (those that have
 * already emitted their terminal `task-notification`) the registry
 * retains. Without this cap, every short-lived background subagent
 * leaves a row in the Background tasks dialog and pill forever,
 * crowding out the running entries the user actually opened the
 * dialog to find. Mirrors the rationale + retention pattern in
 * `MonitorRegistry.MAX_RETAINED_TERMINAL_MONITORS` and
 * `BackgroundShellRegistry.MAX_RETAINED_TERMINAL_SHELLS`.
 *
 * Entries that are still `running`, `paused`, or `cancelled` but
 * not yet notified are NEVER evicted — pruning a not-yet-notified
 * cancelled entry would break the SDK contract that every
 * `register` pairs with exactly one terminal `task-notification`.
 */
export const MAX_RETAINED_TERMINAL_AGENTS = 32;
// Grace period after cancel() before emitting a fallback cancelled
// notification. The natural handler (bgBody) almost always settles and
// emits the terminal notification with the real partial result well
// within this window; the timeout only fires for pathological tools
// that ignore AbortSignal. Must be long enough that normal scheduler
// unwind wins the race, short enough that a stuck headless wait loop
// doesn't feel hung.
const CANCEL_GRACE_MS = 5000;
/**
 * Outcome used to auto-reject a parked approval that can no longer be
 * answered (the agent terminated, or the entry was gone when the event
 * arrived). `Cancel` resolves the parked tool call as denied so the
 * agent's reasoning loop unblocks instead of hanging.
 */
const REJECTED_OUTCOME = ToolConfirmationOutcome.Cancel;
/**
 * Single source of truth for the human-facing label of a background
 * entry. Shared by the notification payload (model-facing) and the TUI
 * dialog (user-facing) so the two surfaces never drift.
 *
 * When `includePrefix` is true (default), returns `subagentType: desc`;
 * when false, returns the bare truncated description — used where the
 * subagent type is already rendered separately (e.g. the dialog header).
 */
export function buildBackgroundEntryLabel(entry, options = {}) {
    const { includePrefix = true } = options;
    let raw = entry.description;
    if (entry.subagentType &&
        raw.toLowerCase().startsWith(entry.subagentType.toLowerCase() + ':')) {
        raw = raw.slice(entry.subagentType.length + 1).trimStart();
    }
    const truncated = raw.length > MAX_DESCRIPTION_LENGTH
        ? raw.slice(0, MAX_DESCRIPTION_LENGTH - 1) + '\u2026'
        : raw;
    return includePrefix && entry.subagentType
        ? `${entry.subagentType}: ${truncated}`
        : truncated;
}
const BACKGROUND_SLOT_WAIT_CANCELLED = 'Agent launch cancelled while waiting for a background slot.';
export class BackgroundTaskRegistry {
    agents = new Map();
    residentAgents = new Map();
    messageWaiters = new Map();
    finishingAgents = new Set();
    finishingWaiters = new Map();
    waitQueue = [];
    // Maps each outstanding slot reservation to the concrete model ID it was
    // reserved for (undefined when unresolved). A Map rather than a Set so the
    // per-model cap can count reservations against the same model the running
    // agents are tallied under.
    reservedBackgroundSlots = new Map();
    maxConcurrentBackgroundAgents;
    // Per-model concurrency caps keyed by concrete model ID. Empty when no
    // `agents.maxParallelAgentsByModel` is configured, in which case only the
    // global cap is enforced.
    maxConcurrentBackgroundAgentsByModel;
    notificationCallback;
    registerCallback;
    statusChangeCallback;
    activityChangeCallback;
    approvalChangeCallback;
    constructor(options = {}) {
        const configured = options.maxConcurrentBackgroundAgents ?? MAX_CONCURRENT_BACKGROUND_AGENTS;
        this.maxConcurrentBackgroundAgents =
            Number.isInteger(configured) && configured >= 1
                ? configured
                : MAX_CONCURRENT_BACKGROUND_AGENTS;
        this.maxConcurrentBackgroundAgentsByModel = normalizePerModelConcurrency(options.maxConcurrentBackgroundAgentsByModel);
    }
    /**
     * Whether a new background agent may start. Always bounded by the global
     * cap; when `model` is given and a per-model cap is configured for it, the
     * per-model cap must also have room.
     */
    canStartBackgroundAgent(model) {
        if (this.getClaimedBackgroundSlotCount() >= this.maxConcurrentBackgroundAgents) {
            return false;
        }
        const perModelCap = this.resolvePerModelCap(model);
        if (perModelCap !== undefined &&
            this.getClaimedBackgroundSlotCount(model) >= perModelCap) {
            return false;
        }
        return true;
    }
    getMaxConcurrentBackgroundAgents() {
        return this.maxConcurrentBackgroundAgents;
    }
    assertCanStartBackgroundAgent(model) {
        const claimed = this.getClaimedBackgroundSlotCount();
        if (claimed >= this.maxConcurrentBackgroundAgents) {
            debugLogger.warn(`Background agent concurrency cap reached: ` +
                `${claimed}/${this.maxConcurrentBackgroundAgents}. ` +
                `Refusing new background agent.`);
            throw new Error(`Cannot start background agent: maximum concurrent background agents ` +
                `(${this.maxConcurrentBackgroundAgents}) reached. Stop an existing ` +
                `agent first.`);
        }
        const perModelCap = this.resolvePerModelCap(model);
        if (perModelCap !== undefined) {
            const claimedForModel = this.getClaimedBackgroundSlotCount(model);
            if (claimedForModel >= perModelCap) {
                debugLogger.warn(`Background agent per-model concurrency cap reached for ` +
                    `${JSON.stringify(model)}: ${claimedForModel}/${perModelCap}. ` +
                    `Refusing new background agent.`);
                throw new Error(`Cannot start background agent: maximum concurrent background agents ` +
                    `for model "${model}" (${perModelCap}) reached. Stop an existing ` +
                    `agent on that model first.`);
            }
        }
    }
    /** Configured per-model cap for `model`, or undefined when none applies. */
    resolvePerModelCap(model) {
        if (model === undefined) {
            return undefined;
        }
        return this.maxConcurrentBackgroundAgentsByModel.get(model);
    }
    async waitForBackgroundSlot(signal, model) {
        if (signal?.aborted) {
            throw new Error(BACKGROUND_SLOT_WAIT_CANCELLED);
        }
        const reservation = this.tryReserveBackgroundSlot(model);
        if (reservation) {
            return reservation;
        }
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                const index = this.waitQueue.indexOf(waiter);
                if (index !== -1) {
                    this.waitQueue.splice(index, 1);
                }
                reject(new Error(BACKGROUND_SLOT_WAIT_CANCELLED));
            };
            const waiter = {
                signal,
                model,
                resolve,
                reject,
                onAbort,
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.waitQueue.push(waiter);
        });
    }
    tryReserveBackgroundSlot(model) {
        if (!this.canStartBackgroundAgent(model)) {
            return undefined;
        }
        return this.reserveBackgroundSlot(model);
    }
    getQueuedCount() {
        return this.waitQueue.length;
    }
    releaseBackgroundSlot(reservation) {
        if (this.reservedBackgroundSlots.delete(reservation.id)) {
            this.drainWaitQueue();
        }
    }
    register(registration, options = {}) {
        const existing = this.agents.get(registration.agentId);
        const wasRunningBackground = existing?.isBackgrounded === true && existing.status === 'running';
        if (registration.status === 'running' && registration.isBackgrounded) {
            const isReplacingRunning = existing?.status === 'running';
            if (!isReplacingRunning) {
                if (options.slotReservation) {
                    this.consumeBackgroundSlot(options.slotReservation);
                }
                else {
                    this.assertCanStartBackgroundAgent(registration.model);
                }
            }
        }
        if (existing && existing !== registration) {
            this.disposeResidentAgent(registration.agentId);
        }
        // Mutate the registration in place to graduate it to an `AgentTask`.
        // Returning the same reference lets callers (e.g. the resume service)
        // continue using their local variable post-register and lets external
        // consumers see updates the registry makes without an extra `get()`.
        const entry = registration;
        entry.id = registration.agentId;
        entry.kind = 'agent';
        entry.outputOffset = options.preserveNotificationState
            ? (registration.outputOffset ?? 0)
            : 0;
        entry.notified = options.preserveNotificationState
            ? (registration.notified ?? false)
            : false;
        entry.todoWorkChainId ??= todoWorkChainContext.getStore();
        entry.pendingMessages = registration.pendingMessages ?? [];
        // Resolve the parent's display name at registration time — before the
        // parent can evict — so the UI's orphan annotation survives it. Owned
        // here rather than at call sites so every registration path that
        // carries a parentAgentId (spawn, resume, future flavors) gets it
        // without remembering to. A caller-provided name wins.
        if (entry.parentName === undefined && entry.parentAgentId != null) {
            entry.parentName = this.agents.get(entry.parentAgentId)?.subagentType;
        }
        this.agents.set(entry.agentId, entry);
        this.releaseFinishingWaiters(entry.agentId, true);
        debugLogger.info(`Registered background agent: ${entry.agentId}`);
        if (wasRunningBackground &&
            (!entry.isBackgrounded || entry.status !== 'running')) {
            this.drainWaitQueue();
        }
        // Foreground entries are paired with a synchronous tool-call result on
        // the parent's response and never emit a terminal `task_notification`
        // (see emitNotification's isBackgrounded gate). Letting them fire the
        // register callback would emit a `task_started` SDK event without a
        // matching completion event, breaking the lifecycle contract for SDK
        // consumers.
        if (entry.isBackgrounded &&
            this.registerCallback &&
            !options.suppressRegisterCallback) {
            try {
                this.registerCallback(entry);
            }
            catch (error) {
                debugLogger.error('Failed to emit register callback:', error);
            }
        }
        this.emitStatusChange(entry);
        return entry;
    }
    /**
     * Restart a completed background task for another turn while preserving its
     * resident runtime. Capacity is checked before mutating the entry so a
     * rejected restart leaves the completed task intact.
     */
    restartCompletedAgent(agentId, abortController) {
        const entry = this.agents.get(agentId);
        if (!entry || !entry.isBackgrounded || entry.status !== 'completed') {
            return undefined;
        }
        this.assertCanStartBackgroundAgent(entry.model);
        entry.status = 'running';
        entry.startTime = Date.now();
        entry.endTime = undefined;
        entry.abortController = abortController;
        entry.result = undefined;
        entry.error = undefined;
        entry.resumeBlockedReason = undefined;
        entry.stats = undefined;
        entry.recentActivities = [];
        entry.pendingApprovals = [];
        entry.persistedCancellationStatus = undefined;
        return this.register(entry);
    }
    registerResidentAgent(agentId, resident) {
        const existing = this.residentAgents.get(agentId);
        if (existing === resident)
            return;
        if (existing) {
            this.disposeResidentAgent(agentId, existing);
        }
        this.residentAgents.set(agentId, resident);
    }
    continueResidentAgent(agentId, message) {
        const entry = this.agents.get(agentId);
        const resident = this.residentAgents.get(agentId);
        if (!resident || entry?.status !== 'completed')
            return false;
        return resident.continue(message);
    }
    unregisterResidentAgent(agentId, resident) {
        const current = this.residentAgents.get(agentId);
        if (!current || (resident && current !== resident))
            return false;
        return this.residentAgents.delete(agentId);
    }
    disposeResidentAgent(agentId, resident) {
        const current = this.residentAgents.get(agentId);
        if (!current || (resident && current !== resident))
            return false;
        this.residentAgents.delete(agentId);
        try {
            current.dispose();
        }
        catch (error) {
            debugLogger.error(`Failed to dispose resident background agent ${agentId}:`, error);
        }
        return true;
    }
    disposeResidentAgents() {
        this.disposeAllResidentAgents();
    }
    // Transition a still-running entry to 'completed' and emit the terminal
    // notification. No-op if the entry is already terminal *and* has been
    // notified — protects against duplicate emission when cancel aborts the
    // signal and the natural handler also races to completion.
    complete(agentId, result, stats) {
        const entry = this.agents.get(agentId);
        if (!entry)
            return;
        // Allow running → completed (normal path) and cancelled → completed
        // (cancel raced the natural handler: the reasoning loop finished with
        // a real result before the abort landed, and we prefer to surface that
        // real result over the bare cancel).
        if (entry.status !== 'running' && entry.status !== 'cancelled')
            return;
        if (entry.notified)
            return;
        const wasCancelled = entry.status === 'cancelled';
        entry.status = 'completed';
        entry.endTime = Date.now();
        entry.result = result;
        entry.stats = stats;
        this.releaseFinishingWaiters(agentId, true);
        debugLogger.info(`Background agent completed: ${agentId}`);
        this.rejectPendingApprovals(entry);
        if (wasCancelled) {
            this.disposeResidentAgent(agentId);
        }
        this.emitNotification(entry);
        this.emitStatusChange(entry);
        this.drainWaitQueue();
    }
    /**
     * Remove a foreground entry from the registry without emitting any
     * terminal notification. Called by the foreground tool-call's `finally`
     * path, which has already delivered the result through the tool-result
     * channel — the registry entry has served its UI-surfacing purpose.
     * Background entries must go through complete/fail/finalizeCancelled
     * instead, so this throws if asked to remove one.
     */
    unregisterForeground(agentId) {
        const entry = this.agents.get(agentId);
        if (!entry)
            return;
        if (entry.isBackgrounded) {
            throw new Error(`unregisterForeground called on non-foreground entry ${agentId} ` +
                `(isBackgrounded=true). ` +
                `Background entries must terminate via complete/fail/finalizeCancelled.`);
        }
        // Delete BEFORE emitting so snapshot-style consumers (those that
        // re-pull `getAll()` from inside the callback) no longer include
        // this entry. The reverse order (emit-then-delete) caused the
        // foreground agent to linger as `status='running'` in the footer
        // pill / dialog: the callback's `getAll()` still saw it, and no
        // second status-change fired after the deletion. Diverges from
        // complete/fail/cancel/finalize ordering on purpose — those
        // keep the entry around (terminal state) so callbacks can inspect
        // it on re-read; unregister removes it outright.
        this.deleteAgent(agentId);
        this.emitStatusChange(entry);
        debugLogger.info(`Unregistered foreground agent: ${agentId}`);
        this.drainWaitQueue();
    }
    // See complete() for the cancelled → terminal path rationale.
    fail(agentId, error, stats) {
        const entry = this.agents.get(agentId);
        if (!entry)
            return;
        if (entry.status !== 'running' && entry.status !== 'cancelled')
            return;
        if (entry.notified)
            return;
        entry.status = 'failed';
        entry.endTime = Date.now();
        entry.error = error;
        entry.stats = stats;
        this.releaseFinishingWaiters(agentId, true);
        debugLogger.info(`Background agent failed: ${agentId}`);
        this.rejectPendingApprovals(entry);
        this.emitNotification(entry);
        this.emitStatusChange(entry);
        this.disposeResidentAgent(agentId);
        this.drainWaitQueue();
    }
    // Cancellation aborts the signal and marks the entry as cancelled, but
    // does *not* emit the terminal notification immediately. The natural
    // completion path (bgBody) fires complete()/fail()/finalizeCancelled()
    // with the real partial/final result, which carries far more information
    // than a bare "cancelled" message. A deferred fallback handles the rare
    // case where a tool ignores AbortSignal and bgBody never settles — the
    // timeout lands on finalizeCancellationIfPending(), which is a no-op
    // once the natural handler has already emitted.
    //
    // Foreground entries (`isBackgrounded === false`) take a partial path
    // through this method: status flips to 'cancelled' and the meta sidecar
    // is patched, but the Map entry is *not* removed. Removal is the caller's
    // responsibility via `unregisterForeground()` in the tool-call's finally
    // path — without that follow-up, the foreground entry leaks. Callers
    // outside `agent.ts` that invoke `cancel()` on a foreground entry must
    // pair it with `unregisterForeground()`.
    cancel(agentId, options = {}) {
        const entry = this.agents.get(agentId);
        if (!entry || entry.status !== 'running')
            return;
        const persistedStatus = options.persistedStatus ?? 'cancelled';
        // Reject parked approvals BEFORE aborting. Order matters: abort()
        // synchronously unwinds the agent's awaiting tool batch, which emits a
        // synthetic TOOL_RESULT for the parked call — the approval bridge's
        // onResult then clears the queue, and a reject that ran after the abort
        // would find nothing left to answer. Rejecting first guarantees each
        // parked call's `respond(Cancel)` actually fires, and the bridge's
        // subsequent clear is a no-op on the already-emptied queue.
        this.rejectPendingApprovals(entry);
        entry.abortController.abort();
        entry.status = 'cancelled';
        entry.endTime = Date.now();
        entry.persistedCancellationStatus = persistedStatus;
        this.releaseFinishingWaiters(agentId, true);
        this.disposeResidentAgent(agentId);
        if (entry.metaPath) {
            patchAgentMeta(entry.metaPath, {
                status: persistedStatus,
                lastUpdatedAt: new Date().toISOString(),
                lastError: undefined,
            });
        }
        debugLogger.info(`Background agent cancelled: ${agentId}`);
        this.emitStatusChange(entry);
        this.drainWaitQueue();
        // Foreground entries don't emit XML notifications and unregister
        // themselves in the tool-call's finally path, so the grace timer
        // would only ever no-op for them.
        if (!entry.isBackgrounded)
            return;
        if (options.notify === false) {
            // Session reset paths intentionally suppress the old task's terminal
            // notification so it cannot leak into a new conversation.
            entry.notified = true;
            this.drainWaitQueue();
            return;
        }
        const timer = setTimeout(() => {
            this.finalizeCancellationIfPending(agentId);
        }, CANCEL_GRACE_MS);
        timer.unref?.();
    }
    /**
     * Marks a paused interrupted task as intentionally discarded/cancelled
     * without emitting a task-notification. Used when the user explicitly
     * abandons a recovered task instead of resuming it.
     */
    abandon(agentId) {
        const entry = this.agents.get(agentId);
        if (!entry || entry.status !== 'paused')
            return;
        entry.status = 'cancelled';
        entry.endTime = Date.now();
        entry.notified = true;
        this.releaseFinishingWaiters(agentId, true);
        debugLogger.info(`Abandoned paused background agent: ${agentId}`);
        this.rejectPendingApprovals(entry);
        this.emitStatusChange(entry);
        this.disposeResidentAgent(agentId);
        this.drainWaitQueue();
    }
    // Emit the terminal cancelled notification once the agent's natural
    // handler has confirmed that the reasoning loop ended because of the
    // abort (terminateMode === CANCELLED). Attaches the partial result and
    // stats so the parent model still sees whatever work the agent had
    // captured before the abort landed, instead of a bare "cancelled" line.
    finalizeCancelled(agentId, partialResult, stats) {
        const entry = this.agents.get(agentId);
        if (!entry)
            return;
        if (entry.status !== 'running' && entry.status !== 'cancelled')
            return;
        if (entry.notified)
            return;
        entry.status = 'cancelled';
        entry.endTime ??= Date.now();
        if (partialResult)
            entry.result = partialResult;
        entry.stats = stats;
        this.releaseFinishingWaiters(agentId, true);
        this.rejectPendingApprovals(entry);
        this.emitNotification(entry);
        this.emitStatusChange(entry);
        this.disposeResidentAgent(agentId);
        this.drainWaitQueue();
    }
    // Emit the terminal cancelled notification for entries that were cancelled
    // but for which no natural handler delivered a follow-up complete()/fail()/
    // finalizeCancelled(). Used by shutdown paths (abortAll) to guarantee the
    // SDK contract (every registered agent produces exactly one
    // task-notification).
    finalizeCancellationIfPending(agentId) {
        const entry = this.agents.get(agentId);
        if (!entry || entry.status !== 'cancelled' || entry.notified)
            return;
        // Defensive: the entry is already 'cancelled', which only cancel() /
        // finalizeCancelled() / abandon() produce, and all of those reject
        // parked approvals — so this is normally a no-op. Kept so the
        // one-notification-per-agent shutdown fallback can never settle an
        // entry while a parked respond() callback is still outstanding.
        this.rejectPendingApprovals(entry);
        this.emitNotification(entry);
        this.emitStatusChange(entry);
        this.disposeResidentAgent(agentId);
        this.drainWaitQueue();
    }
    /**
     * Append a recent tool activity to a running entry's rolling buffer.
     * No-op if the entry is not running — late events after a cancellation
     * shouldn't leak into the Progress section.
     */
    appendActivity(agentId, activity) {
        const entry = this.agents.get(agentId);
        if (!entry || entry.status !== 'running')
            return;
        const prior = entry.recentActivities ?? [];
        const next = [...prior, activity];
        if (next.length > MAX_RECENT_ACTIVITIES) {
            next.splice(0, next.length - MAX_RECENT_ACTIVITIES);
        }
        entry.recentActivities = next;
        this.emitActivityChange(entry);
    }
    /**
     * Park a tool call awaiting user approval ("permission bubbling"). No-op
     * (and the call is auto-rejected by the caller) if the entry is not a
     * running background agent — late approvals after cancellation must not
     * resurrect a parked prompt. Duplicate callIds are ignored so a
     * re-emitted event can't double-list the same call.
     */
    addPendingApproval(agentId, approval) {
        const entry = this.agents.get(agentId);
        if (!entry || !entry.isBackgrounded || entry.status !== 'running') {
            return false;
        }
        const prior = entry.pendingApprovals ?? [];
        if (prior.some((a) => a.callId === approval.callId))
            return false;
        entry.pendingApprovals = [...prior, approval];
        debugLogger.info(`Parked approval for background agent ${agentId} ` +
            `(call ${approval.callId}, ${entry.pendingApprovals.length} pending)`);
        this.emitApprovalChange(entry);
        return true;
    }
    /**
     * Answer a parked approval with the user's outcome. Invokes the parked
     * call's `respond` callback (which re-enters the agent's runtime frames
     * and resumes the tool), removes it from the queue, and fires an approval
     * change. No-op if the call isn't parked (already answered or cleared).
     */
    async resolvePendingApproval(agentId, callId, outcome, payload) {
        const entry = this.agents.get(agentId);
        if (!entry)
            return false;
        const approval = entry.pendingApprovals?.find((a) => a.callId === callId);
        if (!approval)
            return false;
        // Remove before responding so a re-entrant read inside the respond
        // chain (or a racing TOOL_RESULT clear) sees the call already gone.
        entry.pendingApprovals = (entry.pendingApprovals ?? []).filter((a) => a.callId !== callId);
        this.emitApprovalChange(entry);
        try {
            const normalizedOutcome = normalizeBackgroundApprovalOutcome(outcome, approval.confirmationDetails);
            await approval.respond(normalizedOutcome, normalizedOutcome === outcome ? payload : undefined);
        }
        catch (error) {
            debugLogger.error(`Failed to resolve background approval for ${agentId}/${callId}:`, error);
            this.fail(agentId, `Failed to resolve background approval: ${callId}`);
            entry.abortController.abort();
            return false;
        }
        return true;
    }
    /**
     * Drop a parked approval WITHOUT responding. Used when the underlying
     * tool call settled through another path (e.g. the scheduler resolved it
     * via an IDE confirmation handler) so the stale prompt must clear without
     * double-answering. Mirrors the foreground `pendingConfirmation` clear in
     * the Agent tool's TOOL_RESULT handler.
     */
    clearPendingApproval(agentId, callId) {
        const entry = this.agents.get(agentId);
        if (!entry?.pendingApprovals?.length)
            return;
        const next = entry.pendingApprovals.filter((a) => a.callId !== callId);
        if (next.length === entry.pendingApprovals.length)
            return;
        entry.pendingApprovals = next;
        this.emitApprovalChange(entry);
    }
    /** Read a background agent's parked approvals (empty if none). */
    getPendingApprovals(agentId) {
        return this.agents.get(agentId)?.pendingApprovals ?? [];
    }
    /**
     * Subscribe to a background agent's tool-call event stream and bridge
     * approval requests into this registry's parked-approval queue. Returns
     * an unsubscribe function the caller MUST invoke when the agent
     * terminates. Only wire this up when the agent opted into permission
     * bubbling — otherwise the scheduler auto-denies before any
     * `TOOL_WAITING_APPROVAL` fires and this would never see an event anyway.
     *
     * On agent termination any still-parked approval is auto-rejected via its
     * `respond` callback (handled by the caller's cleanup of the agent), so
     * the reasoning loop never hangs on an unanswered prompt.
     */
    bridgeApprovalEvents(agentId, emitter) {
        const onWaiting = (event) => {
            const parked = this.addPendingApproval(agentId, {
                callId: event.callId,
                name: event.name,
                description: event.description,
                confirmationDetails: event.confirmationDetails,
                respond: event.respond,
                at: event.timestamp,
            });
            // If the entry is already gone/terminal we couldn't park it — reject
            // so the agent's reasoning loop doesn't block forever on this call.
            // `.catch()` rather than try/catch: respond is async and a late
            // rejection (frames torn down post-termination) must not escape as
            // an unhandledRejection.
            if (!parked) {
                void event.respond(REJECTED_OUTCOME).catch((error) => {
                    debugLogger.error(`Failed to reject unparkable approval ${agentId}/${event.callId}:`, error);
                });
            }
        };
        const onResult = (event) => {
            // A result for a parked call means it settled elsewhere — clear the
            // stale prompt (without responding again).
            this.clearPendingApproval(agentId, event.callId);
        };
        emitter.on(AgentEventType.TOOL_WAITING_APPROVAL, onWaiting);
        emitter.on(AgentEventType.TOOL_RESULT, onResult);
        return () => {
            emitter.off(AgentEventType.TOOL_WAITING_APPROVAL, onWaiting);
            emitter.off(AgentEventType.TOOL_RESULT, onResult);
        };
    }
    get(agentId) {
        return this.agents.get(agentId);
    }
    /**
     * Snapshot of every entry regardless of status. Used by the TUI
     * footer/dialog to render rows for still-running AND terminal-state
     * tasks; the headless holdback loop keys off `hasUnfinalizedTasks`
     * instead, so callers that only need the running slice can filter
     * this snapshot at the call site.
     */
    getAll() {
        return Array.from(this.agents.values());
    }
    // Counts backgrounded agents that still occupy a slot: running, or
    // cancelled-but-not-yet-finalized. When `model` is given, only agents on
    // that model are counted (per-model cap); otherwise all of them (global).
    getRunningBackgroundCount(model) {
        let count = 0;
        for (const entry of this.agents.values()) {
            const occupiesSlot = entry.isBackgrounded &&
                (entry.status === 'running' ||
                    (entry.status === 'cancelled' && !entry.notified));
            if (!occupiesSlot) {
                continue;
            }
            if (model === undefined || entry.model === model) {
                count++;
            }
        }
        return count;
    }
    getReservedBackgroundSlotCount(model) {
        if (model === undefined) {
            return this.reservedBackgroundSlots.size;
        }
        let count = 0;
        for (const slotModel of this.reservedBackgroundSlots.values()) {
            if (slotModel === model) {
                count++;
            }
        }
        return count;
    }
    getClaimedBackgroundSlotCount(model) {
        return (this.getRunningBackgroundCount(model) +
            this.getReservedBackgroundSlotCount(model));
    }
    reserveBackgroundSlot(model) {
        const id = Symbol('background-slot');
        this.reservedBackgroundSlots.set(id, model);
        return { id, model };
    }
    consumeBackgroundSlot(reservation) {
        if (!this.reservedBackgroundSlots.delete(reservation.id)) {
            throw new Error('Invalid background agent slot reservation; it may have been invalidated by session reset.');
        }
    }
    drainWaitQueue() {
        for (let i = 0; i < this.waitQueue.length;) {
            // Once the global cap is hit no remaining waiter can be served,
            // regardless of model — bail out instead of scanning the rest.
            if (this.getClaimedBackgroundSlotCount() >=
                this.maxConcurrentBackgroundAgents) {
                break;
            }
            const waiter = this.waitQueue[i];
            // A waiter whose model is at its per-model cap stays queued even while
            // a different model's waiter behind it can still be served.
            if (!this.canStartBackgroundAgent(waiter.model)) {
                i++;
                continue;
            }
            this.waitQueue.splice(i, 1);
            waiter.signal?.removeEventListener('abort', waiter.onAbort);
            if (waiter.signal?.aborted) {
                waiter.reject(new Error(BACKGROUND_SLOT_WAIT_CANCELLED));
                continue;
            }
            waiter.resolve(this.reserveBackgroundSlot(waiter.model));
        }
    }
    rejectWaitQueue() {
        const waiters = this.waitQueue.splice(0);
        for (const waiter of waiters) {
            waiter.signal?.removeEventListener('abort', waiter.onAbort);
            waiter.reject(new Error(BACKGROUND_SLOT_WAIT_CANCELLED));
        }
        this.reservedBackgroundSlots.clear();
    }
    /**
     * True if any registered task has not yet emitted its terminal
     * task-notification. Covers `running` (still executing) and
     * `cancelled`-but-not-finalized (cancel requested, but the natural
     * handler hasn't fired finalizeCancelled() yet). Headless callers
     * must keep their event loop alive while this returns true, so every
     * task_started is paired with a matching task_notification.
     */
    hasUnfinalizedTasks() {
        for (const entry of this.agents.values()) {
            // Foreground entries block the parent tool-call synchronously, so the
            // headless event loop is already pinned by the `await` on the caller's
            // promise — counting them here would be redundant and would also keep
            // the loop alive for entries that don't even emit a notification.
            if (!entry.isBackgrounded)
                continue;
            if (entry.status === 'running')
                return true;
            if (entry.status === 'cancelled' && !entry.notified)
                return true;
        }
        return false;
    }
    /**
     * The agent ids behind `hasUnfinalizedTasks()`, in registration order.
     *
     * Callers that must *name* the outstanding work — rather than just know
     * that some exists — use this. The daemon's active-work snapshot builds
     * one hold per id so a restart controller and the session-retention path
     * both see the same set the registry itself would report, with no second
     * ledger to drift out of sync. Deliberately shares
     * `hasUnfinalizedTasks()`'s predicate (and not `hasRunningTasks()`'s):
     * a cancelled entry still owes its terminal task-notification, and
     * dropping it here would let the daemon reap the session inside the
     * cancel → finalizeCancelled() window.
     */
    listUnfinalizedBackgroundAgentIds() {
        const ids = [];
        for (const entry of this.agents.values()) {
            if (!entry.isBackgrounded)
                continue;
            if (entry.status === 'running' ||
                (entry.status === 'cancelled' && !entry.notified)) {
                ids.push(entry.agentId);
            }
        }
        return ids;
    }
    /**
     * True while any background entry is still actually executing. Unlike
     * `hasUnfinalizedTasks()`, a `cancelled`-but-not-yet-finalized entry
     * does NOT count: its work has already been aborted and only the
     * terminal task-notification is outstanding. Session-switch gates
     * (/clear, /resume) key off this instead — they abort-and-reset the
     * registry right after passing the gate, which suppresses that very
     * notification, so blocking on it made the command silently no-op
     * when the user cleared immediately after cancelling (issue #5949).
     * Headless holdback loops must keep using `hasUnfinalizedTasks()` so
     * every task_started still pairs with a task_notification.
     */
    hasRunningTasks() {
        for (const entry of this.agents.values()) {
            if (!entry.isBackgrounded)
                continue;
            if (entry.status === 'running')
                return true;
        }
        return false;
    }
    /**
     * Drops every in-memory entry without touching sidecar state.
     *
     * Used only when switching to a different session after the caller has
     * already established that no live work from the current session is still
     * running. Paused/interrupted entries remain recoverable from disk because
     * their sidecars keep the persisted status.
     */
    reset() {
        const firstEntry = this.agents.values().next().value;
        if (!firstEntry) {
            this.releaseAllFinishingWaiters(false);
            this.disposeAllResidentAgents();
            this.rejectWaitQueue();
            return;
        }
        for (const entry of this.agents.values()) {
            // Defensive: callers (session switch via /resume, /clear) gate on
            // hasBlockingBackgroundWork() and so only reach reset() once every
            // entry is terminal — at which point parked approvals were already
            // rejected. Reject again here so a future caller that drops the guard
            // can't strand a parked respond() callback (a hung agent loop).
            this.rejectPendingApprovals(entry);
            this.wakeMessageWaiters(entry.agentId);
        }
        this.rejectWaitQueue();
        this.releaseAllFinishingWaiters(false);
        this.agents.clear();
        this.disposeAllResidentAgents();
        this.emitStatusChange(firstEntry);
    }
    /**
     * Enqueue a message for delivery to a running background agent.
     * The agent drains this queue between tool rounds.
     */
    queueMessage(agentId, message) {
        return this.queueExternalInput(agentId, message);
    }
    /**
     * Enqueue generalized external input for an agent. Use queueMessage for the
     * parent send_message text path; this lower-level API also accepts
     * structured inputs such as owner-routed Monitor notifications.
     */
    queueExternalInput(agentId, input) {
        const entry = this.agents.get(agentId);
        if (!entry ||
            entry.status !== 'running' ||
            this.finishingAgents.has(agentId)) {
            return false;
        }
        const queue = entry.pendingMessages;
        queue.push(input);
        debugLogger.info(`Queued message for background agent ${agentId} (${queue.length} pending)`);
        this.wakeMessageWaiters(agentId);
        return true;
    }
    /** Close the input queue after its final drain but before async teardown. */
    beginFinishing(agentId) {
        const entry = this.agents.get(agentId);
        if (!entry || entry.status !== 'running')
            return false;
        this.finishingAgents.add(agentId);
        return true;
    }
    isFinishing(agentId) {
        return this.finishingAgents.has(agentId);
    }
    /** Wait until a finishing task publishes its terminal state. */
    waitForFinishing(agentId, signal) {
        if (!this.finishingAgents.has(agentId))
            return Promise.resolve(true);
        if (signal.aborted)
            return Promise.resolve(false);
        return new Promise((resolve) => {
            const settle = (settled) => {
                signal.removeEventListener('abort', onAbort);
                const waiters = this.finishingWaiters.get(agentId);
                waiters?.delete(settle);
                if (waiters?.size === 0)
                    this.finishingWaiters.delete(agentId);
                resolve(settled);
            };
            const onAbort = () => settle(false);
            const waiters = this.finishingWaiters.get(agentId) ?? new Set();
            waiters.add(settle);
            this.finishingWaiters.set(agentId, waiters);
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted)
                onAbort();
        });
    }
    /**
     * Drain all pending messages for an agent. Returns the messages
     * and clears the queue. Called by the agent's reasoning loop.
     */
    drainMessages(agentId) {
        const entry = this.agents.get(agentId);
        if (!entry || !entry.pendingMessages.length)
            return [];
        const messages = entry.pendingMessages.splice(0);
        debugLogger.info(`Drained ${messages.length} message(s) for background agent ${agentId}`);
        return messages;
    }
    async waitForMessages(agentId, signal) {
        const immediate = this.drainMessages(agentId);
        if (immediate.length > 0)
            return immediate;
        const entry = this.agents.get(agentId);
        if (!entry || entry.status !== 'running' || signal.aborted)
            return [];
        return new Promise((resolve) => {
            const cleanup = () => {
                signal.removeEventListener('abort', onAbort);
                const waiters = this.messageWaiters.get(agentId);
                if (!waiters)
                    return;
                waiters.delete(onWake);
                if (waiters.size === 0) {
                    this.messageWaiters.delete(agentId);
                }
            };
            const resolveWithDrain = () => {
                cleanup();
                resolve(this.drainMessages(agentId));
            };
            const onWake = () => resolveWithDrain();
            const onAbort = () => {
                cleanup();
                resolve([]);
            };
            let waiters = this.messageWaiters.get(agentId);
            if (!waiters) {
                waiters = new Set();
                this.messageWaiters.set(agentId, waiters);
            }
            waiters.add(onWake);
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) {
                cleanup();
                resolve([]);
                return;
            }
        });
    }
    wakeExternalInputWaiters(agentId) {
        this.wakeMessageWaiters(agentId);
    }
    setNotificationCallback(cb) {
        this.notificationCallback = cb;
    }
    setRegisterCallback(cb) {
        this.registerCallback = cb;
    }
    setStatusChangeCallback(cb) {
        this.statusChangeCallback = cb;
    }
    /**
     * Retract `cb`, but only if it is still the installed one.
     *
     * The slot holds a single callback, so a subscriber that clears it
     * unconditionally on teardown can unhook whoever claimed it afterwards. This
     * makes the retraction safe to call from any owner's dispose path without
     * having to know whether it is still the owner.
     */
    clearStatusChangeCallback(cb) {
        if (this.statusChangeCallback === cb) {
            this.statusChangeCallback = undefined;
        }
    }
    setActivityChangeCallback(cb) {
        this.activityChangeCallback = cb;
    }
    setApprovalChangeCallback(cb) {
        this.approvalChangeCallback = cb;
    }
    abortAll(options = {}) {
        const cancelOptions = {
            persistedStatus: 'running',
            ...options,
        };
        for (const entry of Array.from(this.agents.values())) {
            if (entry.status === 'running') {
                this.cancel(entry.agentId, cancelOptions);
            }
            if (cancelOptions.notify === false) {
                entry.notified = true;
                continue;
            }
            // Shutdown path: no natural handler will run, so emit the cancelled
            // notification here to honour the one-notification-per-agent contract.
            this.finalizeCancellationIfPending(entry.agentId);
        }
        this.disposeAllResidentAgents();
        debugLogger.info('Aborted all background agents');
    }
    buildDisplayLabel(entry) {
        return buildBackgroundEntryLabel(entry);
    }
    emitNotification(entry) {
        // Mark notified *before* invoking the callback so that a re-entrant
        // terminal call inside the callback chain (cancel → complete race)
        // sees the flag and short-circuits, rather than firing twice.
        if (entry.notified)
            return;
        entry.notified = true;
        // Foreground entries return their result through the parent's normal
        // tool-result channel (the `returnDisplay` field on the synchronous
        // tool-call). Emitting the XML envelope on top would feed the parent
        // model the same payload twice.
        if (!entry.isBackgrounded)
            return;
        if (!this.notificationCallback)
            return;
        const statusText = entry.status === 'completed'
            ? 'completed'
            : entry.status === 'failed'
                ? 'failed'
                : 'was cancelled';
        const label = this.buildDisplayLabel(entry);
        const displayLine = `Background agent "${label}" ${statusText}.`;
        const xmlParts = [
            '<task-notification>',
            `<task-id>${escapeXml(entry.agentId)}</task-id>`,
        ];
        if (entry.toolUseId) {
            xmlParts.push(`<tool-use-id>${escapeXml(entry.toolUseId)}</tool-use-id>`);
        }
        xmlParts.push(`<status>${escapeXml(entry.status)}</status>`, `<summary>Agent "${escapeXml(entry.description)}" ${statusText}.</summary>`);
        if (entry.result) {
            xmlParts.push(`<result>${escapeXml(entry.result)}</result>`);
        }
        if (entry.error) {
            xmlParts.push(`<result>Error: ${escapeXml(entry.error)}</result>`);
        }
        if (entry.outputFile) {
            xmlParts.push(`<output-file>${escapeXml(entry.outputFile)}</output-file>`);
        }
        if (entry.stats) {
            xmlParts.push('<usage>', `<total_tokens>${entry.stats.totalTokens}</total_tokens>`, `<tool_uses>${entry.stats.toolUses}</tool_uses>`, `<duration_ms>${entry.stats.durationMs}</duration_ms>`, '</usage>');
        }
        xmlParts.push('</task-notification>');
        const meta = {
            agentId: entry.agentId,
            status: entry.status,
            stats: entry.stats,
            toolUseId: entry.toolUseId,
            todoWorkChainId: entry.todoWorkChainId,
        };
        try {
            // The terminal transition (complete/fail/cancel) that reaches this
            // point runs inside the finished agent's AsyncLocalStorage frame, and
            // ALS context follows every async continuation the callback starts —
            // including the React state update that drains the notification into
            // a new conversation turn. Without exiting the frame here, that turn
            // resolves Config.getModel() to the SUBAGENT's model and the main
            // session's history can overflow its smaller context window (#7156).
            // A notification is main-session-owned, so emit it with no agent
            // frame at all.
            runOutsideAgentContext(() => this.notificationCallback(displayLine, xmlParts.join('\n'), meta));
        }
        catch (error) {
            debugLogger.error('Failed to emit background notification:', error);
        }
    }
    emitStatusChange(entry) {
        this.pruneTerminalEntries();
        if (!this.statusChangeCallback)
            return;
        try {
            this.statusChangeCallback(entry);
        }
        catch (error) {
            debugLogger.error('Failed to emit background status change:', error);
        }
    }
    /**
     * Evict the oldest fully-finalized terminal entries (those with
     * `notified === true`) once their count exceeds
     * `MAX_RETAINED_TERMINAL_AGENTS`. Sorted by `endTime` (then
     * `startTime` as a tiebreaker for entries that share an endTime).
     *
     * Running, paused, and cancelled-but-not-yet-notified entries are
     * excluded from the eviction set:
     *   - running / paused: the user explicitly cares about live work,
     *     and pruning a paused entry would silently drop a recoverable
     *     task without giving the user a chance to resume / abandon it.
     *   - cancelled but not notified: the natural handler (or grace
     *     timer) is still going to fire `finalizeCancelled` /
     *     `finalizeCancellationIfPending`. Evicting now would break the
     *     SDK contract that every `register` pairs with exactly one
     *     terminal `task-notification`.
     *
     * The caller (typically `emitStatusChange`) is responsible for
     * invoking this after every transition that mutates `notified` or
     * `endTime`. Cap-exceeded eviction is a best-effort: a transition
     * that sets `notified = true` outside the status-change path (the
     * `cancel({ notify: false })` shortcut and `abortAll`'s loop body)
     * may briefly carry a few extra entries until the next transition
     * triggers another prune. Both of those paths are reset / shutdown
     * adjacent — the registry is about to be cleared via `reset()`
     * anyway, so the extra retention does not leak across sessions.
     */
    pruneTerminalEntries() {
        const evictable = Array.from(this.agents.values())
            .filter((entry) => entry.notified === true)
            .sort((a, b) => (a.endTime ?? a.startTime) - (b.endTime ?? b.startTime) ||
            a.startTime - b.startTime);
        while (evictable.length > MAX_RETAINED_TERMINAL_AGENTS) {
            const oldest = evictable.shift();
            if (oldest) {
                this.deleteAgent(oldest.agentId);
            }
        }
    }
    deleteAgent(agentId) {
        this.releaseFinishingWaiters(agentId, false);
        this.disposeResidentAgent(agentId);
        return this.agents.delete(agentId);
    }
    releaseFinishingWaiters(agentId, settled) {
        this.finishingAgents.delete(agentId);
        const waiters = this.finishingWaiters.get(agentId);
        if (!waiters)
            return;
        this.finishingWaiters.delete(agentId);
        for (const resolve of waiters)
            resolve(settled);
    }
    releaseAllFinishingWaiters(settled) {
        for (const agentId of Array.from(this.finishingAgents)) {
            this.releaseFinishingWaiters(agentId, settled);
        }
    }
    disposeAllResidentAgents() {
        for (const agentId of Array.from(this.residentAgents.keys())) {
            this.disposeResidentAgent(agentId);
        }
    }
    wakeMessageWaiters(agentId) {
        const waiters = this.messageWaiters.get(agentId);
        if (!waiters)
            return;
        this.messageWaiters.delete(agentId);
        for (const waiter of waiters) {
            waiter();
        }
    }
    emitActivityChange(entry) {
        if (!this.activityChangeCallback)
            return;
        try {
            this.activityChangeCallback(entry);
        }
        catch (error) {
            debugLogger.error('Failed to emit background activity change:', error);
        }
    }
    emitApprovalChange(entry) {
        if (!this.approvalChangeCallback)
            return;
        try {
            this.approvalChangeCallback(entry);
        }
        catch (error) {
            debugLogger.error('Failed to emit background approval change:', error);
        }
    }
    /**
     * Auto-reject and drop every parked approval for an entry. Called when
     * the entry reaches a terminal state so the agent's reasoning loop never
     * hangs on a prompt no one will answer, and the UI surface clears. Each
     * parked call is resolved with `Cancel` (denied). Safe to call on entries
     * with no parked approvals.
     */
    rejectPendingApprovals(entry) {
        const parked = entry.pendingApprovals;
        if (!parked?.length)
            return;
        entry.pendingApprovals = [];
        for (const approval of parked) {
            // `respond` is async — a `.catch()` on the promise is the only thing
            // that actually intercepts its rejection (a surrounding try/catch
            // would only see synchronous throws and let the rejection escape as
            // an unhandledRejection).
            void approval.respond(REJECTED_OUTCOME).catch((error) => {
                debugLogger.error(`Failed to auto-reject parked approval ${entry.agentId}/${approval.callId}:`, error);
            });
        }
        this.emitApprovalChange(entry);
    }
}
//# sourceMappingURL=background-tasks.js.map