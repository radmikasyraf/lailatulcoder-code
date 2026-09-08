/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { AgentEventType, } from './runtime/agent-events.js';
import { ToolConfirmationOutcome, } from '../tools/tools.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { todoWorkChainContext } from '../utils/promptIdContext.js';
import { stripAnsiAndControl } from '../utils/textUtils.js';
import { escapeXml } from '../utils/xml.js';
import { runOutsideAgentContext } from './runtime/agent-context.js';
const debugLogger = createDebugLogger('WORKFLOW_REGISTRY');
/**
 * Cap on terminal entries retained for dialog history. Picked smaller
 * than `MAX_RETAINED_TERMINAL_AGENTS` (32) because workflow rows carry
 * the heavier label (workflow name + phase tree) and because users
 * typically run far fewer workflows than agents per session.
 */
export const MAX_RETAINED_TERMINAL_WORKFLOWS = 10;
export function isActiveWorkflowStatus(status) {
    return status === 'running' || status === 'pausing' || status === 'paused';
}
export function isTerminalWorkflowStatus(status) {
    // Explicit positive match rather than `!isActiveWorkflowStatus(status)`:
    // a status later added to WorkflowStatus must not silently classify as
    // terminal and flow into WorkflowSnapshot.status (typed to this union).
    return (status === 'completed' || status === 'failed' || status === 'cancelled');
}
export const MAX_PENDING_WORKFLOW_APPROVALS = 32;
export const MAX_WORKFLOW_APPROVAL_DISPLAY_CHARS = 64 * 1024;
export class WorkflowRunRegistry {
    entries = new Map();
    handles = new Map();
    registerCallback;
    statusChangeCallback;
    notificationCallback;
    completionCallback;
    approvalChangeCallback;
    approvalRequestCallback;
    approvalRuntimes = new Map();
    nextApprovalId = 1;
    /**
     * P5 T7: one-time usage-warning latch. The first `Workflow` tool
     * invocation per session checks `shouldShowUsageWarning()`; if true,
     * the tool prepends a one-line banner to the result describing the
     * token-budget knob (`QWEN_CODE_MAX_TOKENS_PER_WORKFLOW`) and how to
     * suppress (`skipWorkflowUsageWarning` setting). The latch flips on
     * the same call so subsequent runs are quiet. Survives `reset()` —
     * the warning is per-session, not per-clear.
     */
    usageWarningShown = false;
    /**
     * P5 T7: gate the one-time usage warning. Returns `true` exactly once
     * per session, flipping the latch as a side effect. Settings-level
     * suppression (`skipWorkflowUsageWarning`) is enforced upstream by
     * the caller (`WorkflowTool`) before invoking — the registry only
     * tracks session-scoped freshness.
     */
    shouldShowUsageWarning() {
        if (this.usageWarningShown)
            return false;
        this.usageWarningShown = true;
        return true;
    }
    setRegisterCallback(cb) {
        this.registerCallback = cb;
    }
    setStatusChangeCallback(cb) {
        this.statusChangeCallback = cb;
    }
    clearStatusChangeCallback(cb) {
        if (this.statusChangeCallback === cb)
            this.statusChangeCallback = undefined;
    }
    setNotificationCallback(cb) {
        this.notificationCallback = cb;
    }
    setCompletionCallback(cb) {
        this.completionCallback = cb;
    }
    hasCompletionCallback() {
        return this.completionCallback !== undefined;
    }
    setApprovalChangeCallback(cb) {
        this.approvalChangeCallback = cb;
    }
    setApprovalRequestCallback(cb) {
        this.approvalRequestCallback = cb;
    }
    /** Fire the terminal-completion notification (best-effort). */
    emitNotification(entry) {
        if (!this.notificationCallback)
            return;
        try {
            this.notificationCallback(entry);
        }
        catch (error) {
            debugLogger.error('Failed to emit workflow notification:', error);
        }
    }
    emitCompletion(entry) {
        if (!entry.isBackgrounded || !this.completionCallback)
            return;
        if (entry.status !== 'completed' && entry.status !== 'failed')
            return;
        const statusText = entry.status === 'completed' ? 'completed' : 'failed';
        const label = stripAnsiAndControl(entry.description) || entry.runId;
        const displayText = `Background workflow "${label}" ${statusText}.`;
        const modelParts = [
            '<task-notification>',
            '<kind>workflow</kind>',
            `<task-id>${escapeXml(entry.runId)}</task-id>`,
            `<status>${entry.status}</status>`,
            `<summary>Background workflow "${escapeXml(label)}" ${statusText}.</summary>`,
        ];
        if (entry.status === 'completed' && entry.result !== undefined) {
            modelParts.push(`<result>${escapeXml(stringifyCompletionResult(entry.result))}</result>`);
        }
        if (entry.status === 'failed') {
            modelParts.push(`<result>Error: ${escapeXml(entry.error ?? '')}</result>`);
        }
        modelParts.push('</task-notification>');
        const meta = {
            runId: entry.runId,
            status: entry.status,
            todoWorkChainId: entry.todoWorkChainId,
        };
        try {
            runOutsideAgentContext(() => this.completionCallback(displayText, modelParts.join('\n'), meta));
        }
        catch (error) {
            debugLogger.error('Failed to emit workflow completion:', error);
        }
    }
    /**
     * Register a new run. Mutates the registration in place to graduate
     * it to a `WorkflowTask` (sets `id`, `kind`, derived counters), so
     * callers can keep using their local reference post-register and
     * observers see updates without an extra `get()`.
     */
    register(registration) {
        const existing = this.entries.get(registration.runId);
        if ((existing && isActiveWorkflowStatus(existing.status)) ||
            this.handles.has(registration.runId)) {
            throw new Error(`Workflow run ${registration.runId} is already active.`);
        }
        const entry = registration;
        entry.id = registration.runId;
        entry.kind = 'workflow';
        entry.outputOffset = 0;
        entry.notified = false;
        entry.isBackgrounded = registration.isBackgrounded ?? false;
        entry.todoWorkChainId ??= todoWorkChainContext.getStore();
        entry.currentPhase = null;
        entry.phases = [];
        entry.phaseVisits = [];
        entry.currentPhaseVisitId = null;
        entry.dispatches = [];
        entry.agentsDispatched = 0;
        entry.agentsCompleted = 0;
        entry.recentLogs = [];
        entry.events = [];
        entry.tokensSpent = 0;
        // Preserve a caller-supplied cap; default to "no cap" otherwise.
        // Note: the registration's optional `tokenBudgetTotal` shape is the
        // sole way to seed this — `onBudgetUpdated` only mirrors mid-run
        // updates, never the initial value.
        if (entry.tokenBudgetTotal === undefined) {
            entry.tokenBudgetTotal = null;
        }
        entry.perPhaseTokens = new Map();
        entry.pendingApprovals = [];
        // P7b: default the script source so the snapshot writer + save dialog
        // always have a (possibly empty) string to work with.
        if (entry.script === undefined)
            entry.script = '';
        if (!entry.description) {
            entry.description = entry.meta?.name ?? entry.runId;
        }
        this.entries.set(entry.runId, entry);
        debugLogger.info(`Registered workflow run: ${entry.runId}`);
        if (this.registerCallback) {
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
    attachHandle(handle) {
        const status = this.entries.get(handle.runId)?.status;
        if (status && isActiveWorkflowStatus(status)) {
            this.handles.set(handle.runId, handle);
        }
    }
    pause(runId) {
        const entry = this.entries.get(runId);
        const handle = this.handles.get(runId);
        if (!entry?.isBackgrounded || entry.status !== 'running' || !handle) {
            return false;
        }
        return handle.pause();
    }
    resume(runId) {
        const entry = this.entries.get(runId);
        const handle = this.handles.get(runId);
        if (!entry || entry.status !== 'paused' || !handle)
            return false;
        return handle.resume();
    }
    onDispatchStateChange(runId, state) {
        const entry = this.entries.get(runId);
        if (!entry || isTerminalWorkflowStatus(entry.status))
            return;
        if (state === 'pausing' && entry.status !== 'running')
            return;
        if (state === 'paused' && entry.status !== 'pausing')
            return;
        if (state === 'running' && entry.status !== 'paused')
            return;
        entry.status = state;
        this.emitStatusChange(entry);
    }
    getHandle(runId) {
        return this.handles.get(runId);
    }
    releaseHandle(runId, handle) {
        if (this.handles.get(runId) === handle)
            this.handles.delete(runId);
    }
    bridgeApprovalEvents(runId, emitter, dispatchId, expectedEntry) {
        const ownedApprovalIds = new Set();
        const seenSources = new Set();
        const isCurrentEntry = () => expectedEntry === undefined || this.entries.get(runId) === expectedEntry;
        const onWaiting = (event) => {
            if (!isCurrentEntry())
                return;
            if (dispatchId) {
                const dispatch = this.entries
                    .get(runId)
                    ?.dispatches.find(({ id }) => id === dispatchId);
                if (dispatch)
                    dispatch.subagentId = event.subagentId;
            }
            const sourceKey = JSON.stringify([event.subagentId, event.callId]);
            // Re-emission of an already-settled call: respond is idempotent via
            // the runtime's responded set, so silently dropping it is safe.
            if (seenSources.has(sourceKey))
                return;
            seenSources.add(sourceKey);
            const parked = this.parkPendingApproval(runId, event, dispatchId);
            if (parked === 'duplicate')
                return;
            if (parked === 'rejected') {
                this.rejectResponder(event.respond);
                return;
            }
            ownedApprovalIds.add(parked);
        };
        const onResult = (event) => {
            if (!isCurrentEntry())
                return;
            this.clearPendingApproval(runId, event.subagentId, event.callId, event.timestamp);
        };
        emitter.on(AgentEventType.TOOL_WAITING_APPROVAL, onWaiting);
        emitter.on(AgentEventType.TOOL_RESULT, onResult);
        return () => {
            emitter.off(AgentEventType.TOOL_WAITING_APPROVAL, onWaiting);
            emitter.off(AgentEventType.TOOL_RESULT, onResult);
            if (!isCurrentEntry())
                return;
            this.rejectPendingApprovals(runId, (approval) => ownedApprovalIds.has(approval.approvalId));
        };
    }
    async resolvePendingApproval(runId, approvalId, outcome, payload) {
        const entry = this.entries.get(runId);
        if (!entry)
            return false;
        const approval = entry.pendingApprovals.find((candidate) => candidate.approvalId === approvalId);
        if (!approval)
            return false;
        const runtime = this.approvalRuntimes.get(approvalId);
        this.appendApprovalEvent(entry, approval, 'approval-settled', Date.now());
        entry.pendingApprovals = entry.pendingApprovals.filter((candidate) => candidate !== approval);
        this.approvalRuntimes.delete(approvalId);
        runtime?.requestController?.abort();
        this.emitApprovalChange(entry);
        if (!runtime)
            return false;
        const normalized = normalizeWorkflowApprovalOutcome(outcome);
        try {
            await runtime.respond(normalized, normalized === outcome ? payload : undefined);
        }
        catch (error) {
            debugLogger.error(`Failed to resolve workflow approval ${runId}/${approvalId}:`, error);
            this.fail(runId, `Failed to resolve workflow approval: ${approvalId}`, Date.now());
            try {
                (this.handles.get(runId) ?? entry.abortController).abort();
            }
            catch (abortError) {
                debugLogger.error('Failed to abort workflow after approval error:', abortError);
            }
            return false;
        }
        return true;
    }
    clearPendingApproval(runId, subagentId, callId, at = Date.now()) {
        const entry = this.entries.get(runId);
        const approval = entry?.pendingApprovals.find((candidate) => candidate.subagentId === subagentId && candidate.callId === callId);
        if (!entry || !approval)
            return false;
        this.appendApprovalEvent(entry, approval, 'approval-settled', at);
        entry.pendingApprovals = entry.pendingApprovals.filter((candidate) => candidate !== approval);
        const runtime = this.approvalRuntimes.get(approval.approvalId);
        this.approvalRuntimes.delete(approval.approvalId);
        runtime?.requestController?.abort();
        this.emitApprovalChange(entry);
        return true;
    }
    parkPendingApproval(runId, event, dispatchId) {
        const entry = this.entries.get(runId);
        if (!entry ||
            !isActiveWorkflowStatus(entry.status) ||
            (!this.approvalChangeCallback && !this.approvalRequestCallback)) {
            debugLogger.warn(`Workflow approval rejected for ${runId}/${event.callId}: entry missing, not active, or no host channel`);
            return 'rejected';
        }
        if (entry.pendingApprovals.some((approval) => approval.subagentId === event.subagentId &&
            approval.callId === event.callId)) {
            return 'duplicate';
        }
        if (entry.pendingApprovals.length >= MAX_PENDING_WORKFLOW_APPROVALS) {
            debugLogger.warn(`Workflow approval rejected for ${runId}/${event.callId}: pending limit (${MAX_PENDING_WORKFLOW_APPROVALS}) reached`);
            return 'rejected';
        }
        const confirmationDetails = restrictWorkflowConfirmationDetails(event.confirmationDetails);
        if (!confirmationDetails ||
            event.name.length +
                event.description.length +
                JSON.stringify(confirmationDetails).length >
                MAX_WORKFLOW_APPROVAL_DISPLAY_CHARS) {
            debugLogger.warn(`Workflow approval rejected for ${runId}/${event.callId}: unsupported type (${event.confirmationDetails.type}) or payload exceeds ${MAX_WORKFLOW_APPROVAL_DISPLAY_CHARS} chars`);
            return 'rejected';
        }
        const approvalId = `wfap_${this.nextApprovalId++}`;
        const approval = {
            approvalId,
            subagentId: event.subagentId,
            callId: event.callId,
            name: event.name,
            description: event.description,
            confirmationDetails,
            at: event.timestamp,
        };
        const approvalRequestCallback = this.approvalRequestCallback;
        const requestController = approvalRequestCallback
            ? new AbortController()
            : undefined;
        this.approvalRuntimes.set(approvalId, {
            respond: event.respond,
            requestController,
        });
        entry.pendingApprovals = [...entry.pendingApprovals, approval];
        this.appendEvent(entry, {
            type: 'approval-requested',
            at: approval.at,
            name: approval.name,
            ...(dispatchId ? { dispatchId } : {}),
        });
        this.emitApprovalChange(entry);
        if (approvalRequestCallback &&
            requestController &&
            !requestController.signal.aborted) {
            try {
                const request = approvalRequestCallback(entry, approval, event.args, requestController.signal);
                void Promise.resolve(request).catch((error) => {
                    debugLogger.error('Workflow approval channel failed:', error);
                    return this.resolvePendingApproval(runId, approvalId, ToolConfirmationOutcome.Cancel);
                });
            }
            catch (error) {
                debugLogger.error('Workflow approval channel failed:', error);
                this.appendApprovalEvent(entry, approval, 'approval-settled', Date.now());
                entry.pendingApprovals = entry.pendingApprovals.filter((candidate) => candidate.approvalId !== approvalId);
                this.approvalRuntimes.delete(approvalId);
                requestController.abort();
                this.emitApprovalChange(entry);
                return 'rejected';
            }
        }
        return approvalId;
    }
    /**
     * Append a phase title. Mirrors the sandbox's `safePhase` collapse:
     * a phase identical to the most recent entry is treated as the same
     * phase and not re-appended. `currentPhase` is set unconditionally.
     *
     * @param runId    the run to update
     * @param rawTitle the phase title from the sandbox `phase()` call
     */
    onPhaseStarted(runId, rawTitle, at = Date.now()) {
        const entry = this.entries.get(runId);
        if (!entry || !isActiveWorkflowStatus(entry.status))
            return;
        // Script-derived titles reach persisted snapshots and TUI rendering:
        // normalize at this registry boundary like every sibling string.
        const title = stripAnsiAndControl(rawTitle).slice(0, 200) || 'phase';
        entry.currentPhase = title;
        const last = entry.phases[entry.phases.length - 1];
        if (last !== title) {
            entry.phases.push(title);
            const priorVisit = entry.phaseVisits[entry.phaseVisits.length - 1];
            if (priorVisit && priorVisit.endedAt === undefined) {
                this.closeCurrentPhase(entry, at);
            }
            const index = entry.phaseVisits.length;
            const visit = {
                id: `phase-${index + 1}`,
                index,
                title,
                startedAt: at,
            };
            entry.phaseVisits.push(visit);
            entry.currentPhaseVisitId = visit.id;
            this.appendEvent(entry, {
                type: 'phase-started',
                at,
                phaseVisitId: visit.id,
                title,
            });
        }
        this.emitStatusChange(entry);
    }
    onDispatchQueued(runId, event) {
        const entry = this.entries.get(runId);
        if (!entry || !isActiveWorkflowStatus(entry.status))
            return;
        if (entry.dispatches.some((dispatch) => dispatch.id === event.id))
            return;
        const fallbackLabel = `Agent ${entry.dispatches.length + 1}`;
        entry.dispatches.push({
            id: event.id,
            phaseVisitId: entry.currentPhaseVisitId,
            label: stripAnsiAndControl(event.label ?? '').slice(0, 200) || fallbackLabel,
            prompt: stripAnsiAndControl(event.prompt).slice(0, 4_096),
            status: event.cached ? 'cached' : 'queued',
            dependsOn: Array.from(new Set(event.dependsOn)).filter((id) => entry.dispatches.some((dispatch) => dispatch.id === id)),
            queuedAt: event.queuedAt,
            ...(event.cached ? { endedAt: event.queuedAt } : {}),
        });
        this.appendEvent(entry, {
            type: 'dispatch-queued',
            at: event.queuedAt,
            dispatchId: event.id,
        });
        if (event.cached) {
            this.appendEvent(entry, {
                type: 'dispatch-cached',
                at: event.queuedAt,
                dispatchId: event.id,
            });
        }
        this.emitStatusChange(entry);
    }
    onDispatchStarted(runId, dispatchId, at = Date.now()) {
        const entry = this.entries.get(runId);
        const dispatch = entry?.dispatches.find(({ id }) => id === dispatchId);
        if (!entry || !dispatch || dispatch.status !== 'queued')
            return;
        dispatch.status = 'running';
        dispatch.startedAt = at;
        this.appendEvent(entry, {
            type: 'dispatch-started',
            at,
            dispatchId,
        });
        this.emitStatusChange(entry);
    }
    onDispatchSettled(runId, dispatchId, error, at = Date.now(), cancelRequested = false) {
        const entry = this.entries.get(runId);
        const dispatch = entry?.dispatches.find(({ id }) => id === dispatchId);
        if (!entry || !dispatch || dispatch.endedAt !== undefined)
            return;
        const shouldRecordEvent = isActiveWorkflowStatus(entry.status);
        dispatch.status =
            entry.status === 'cancelled' || cancelRequested
                ? 'cancelled'
                : error !== undefined
                    ? 'failed'
                    : dispatch.status === 'cached'
                        ? 'cached'
                        : 'completed';
        dispatch.endedAt = at;
        if (error !== undefined && dispatch.status !== 'cancelled')
            dispatch.error = stripAnsiAndControl(error).slice(0, 4_096);
        if (!shouldRecordEvent) {
            this.emitStatusChange(entry);
            return;
        }
        if (dispatch.status === 'failed') {
            this.appendEvent(entry, {
                type: 'dispatch-failed',
                at,
                dispatchId,
                error: dispatch.error || 'Dispatch failed.',
            });
        }
        else {
            this.appendEvent(entry, {
                type: dispatch.status === 'cached'
                    ? 'dispatch-cached'
                    : dispatch.status === 'cancelled'
                        ? 'dispatch-cancelled'
                        : 'dispatch-completed',
                at,
                dispatchId,
            });
        }
        this.emitStatusChange(entry);
    }
    /** Record one sandbox log line without forcing a TUI redraw per line. */
    onLogAppended(runId, line, at = Date.now()) {
        const entry = this.entries.get(runId);
        // Mirrors setRecentLogs's 'cancelled' allowance: a dialog cancel flips
        // the status before the sandbox's run-end flush fires its last mirror
        // lines, and the two persisted log projections must keep agreeing.
        if (!entry ||
            (!isActiveWorkflowStatus(entry.status) && entry.status !== 'cancelled'))
            return;
        const message = stripAnsiAndControl(line).slice(0, 4_096);
        if (entry.recentLogs.length === 100) {
            entry.recentLogs.shift();
            const firstLog = entry.events.findIndex((event) => event.type === 'log');
            if (firstLog >= 0)
                entry.events.splice(firstLog, 1);
        }
        entry.recentLogs.push(message);
        this.appendEvent(entry, { type: 'log', at, message });
    }
    /** Cumulative dispatch counter — incremented before each `agent()` call resolves. */
    onAgentDispatched(runId) {
        const entry = this.entries.get(runId);
        if (!entry || !isActiveWorkflowStatus(entry.status))
            return;
        entry.agentsDispatched++;
        this.emitStatusChange(entry);
    }
    /** Cumulative completion counter — incremented after each `agent()` call settles. */
    onAgentCompleted(runId) {
        const entry = this.entries.get(runId);
        // No status gate: the runner's `finally` aborts the controller after
        // EVERY settlement (completed / failed / cancelled alike), so
        // dispatches in flight at settlement always drain after the terminal
        // status is set — regardless of which terminal it is. Gating the
        // drain to `cancelled` alone froze completed / failed counters
        // mid-drain (e.g. a run that fire-and-forget'd 2 of 5 dispatches
        // permanently showing 3/5 agents). The cap is the only guard needed.
        if (!entry || entry.agentsCompleted >= entry.agentsDispatched)
            return;
        entry.agentsCompleted++;
        this.emitStatusChange(entry);
    }
    /**
     * P5: mirror a `budgetUpdated` emitter event into the entry. Attributes
     * the cumulative delta (`spent - entry.tokensSpent`) to the entry's
     * `currentPhase`. Per-phase attribution is best-effort: agents in
     * flight when the script issues a new `phase()` will attribute their
     * tokens to whichever phase was current when `budgetUpdated` fires —
     * the orchestrator fires immediately after `agentCompleted`, so the
     * race window is bounded but not zero. Tasks before the first
     * `phase()` call attribute to the sentinel `null` key.
     */
    onBudgetUpdated(runId, spent, total) {
        const entry = this.entries.get(runId);
        // Symmetric with `onAgentCompleted`: dispatches in flight at
        // settlement still drain afterwards for EVERY terminal status (the
        // runner's `finally` aborts the controller after every settlement,
        // and the production dispatch reports tokens in a `finally`), and
        // their burn keeps mirroring into `tokensSpent` so the live entry's
        // completed-agent count and token total stay consistent. The
        // persisted snapshot and telemetry event are a best-effort
        // projection frozen at settlement — the runner captures both
        // before its first await, ahead of the in-flight drain — so they
        // may read lower than this entry.
        if (!entry)
            return;
        const delta = spent - entry.tokensSpent;
        const totalChanged = entry.tokenBudgetTotal !== total;
        // P5 R1 (#8): skip the statusChange emit when nothing observable
        // changed. The orchestrator fires `budgetUpdated` after EVERY
        // successful dispatch — including dispatches whose subagent
        // reported `outputTokens === 0` (early failures, fast no-op
        // responses). Those produce a no-delta call here; firing the
        // UI re-render anyway burns frames for no visible effect.
        if (delta <= 0 && !totalChanged)
            return;
        if (delta > 0) {
            const key = entry.currentPhase;
            const prior = entry.perPhaseTokens.get(key) ?? 0;
            entry.perPhaseTokens.set(key, prior + delta);
        }
        entry.tokensSpent = spent;
        // `total` is immutable on the budget, but mirror it defensively so
        // a stale register-time value can't drift if the caller wires a
        // budget without seeding `tokenBudgetTotal`.
        entry.tokenBudgetTotal = total;
        this.emitStatusChange(entry);
    }
    /**
     * Replace the recent-log tail. The sandbox owns the source-of-truth
     * `getLogs()` array; we mirror it here for the UI so the dialog
     * doesn't have to thread a sandbox reference. Capped at 100 entries
     * (the tail) so a chatty workflow doesn't bloat the registry.
     *
     * R7 (wenshao): allowed after a `'cancelled'` transition too. The
     * dialog-initiated cancel path calls `registry.cancel()` first
     * (status flips to `'cancelled'` synchronously), then the abort
     * propagates to the tool's catch arm which calls `setRecentLogs`.
     * Without this, dialog-cancelled runs always showed an empty Logs
     * section. `'completed'` / `'failed'` are still rejected — those
     * terminal states ARE final (no late-arriving logs to absorb).
     */
    setRecentLogs(runId, logs) {
        const entry = this.entries.get(runId);
        if (!entry)
            return;
        if (!isActiveWorkflowStatus(entry.status) && entry.status !== 'cancelled')
            return;
        const tail = logs.length > 100 ? logs.slice(-100) : Array.from(logs);
        entry.recentLogs = tail.map((line) => stripAnsiAndControl(line).slice(0, 4_096));
        // The sandbox buffer tail is the run's final log account: nested merges
        // reach it via appendLog without re-emitting, and the overflow sentinel
        // can be pushed without emission, so the live-mirrored 'log' window can
        // disagree with it in membership AND order. Rebuild the window from the
        // same tail so the two persisted log projections keep agreeing.
        entry.events = entry.events.filter((event) => event.type !== 'log');
        for (const message of entry.recentLogs) {
            this.appendEvent(entry, { type: 'log', at: Date.now(), message });
        }
        this.emitStatusChange(entry);
    }
    complete(runId, result, endTime) {
        const entry = this.entries.get(runId);
        if (!entry || !isActiveWorkflowStatus(entry.status))
            return;
        this.rejectPendingApprovals(runId, undefined, endTime);
        entry.status = 'completed';
        entry.endTime = endTime;
        this.closeCurrentPhase(entry, endTime);
        this.cancelLiveDispatches(entry, endTime);
        entry.result = result;
        this.appendEvent(entry, { type: 'workflow-completed', at: endTime });
        entry.notified = true;
        this.emitStatusChange(entry);
        this.emitNotification(entry);
        this.emitCompletion(entry);
        this.evictTerminal();
    }
    fail(runId, message, endTime) {
        const entry = this.entries.get(runId);
        if (!entry || !isActiveWorkflowStatus(entry.status))
            return;
        this.rejectPendingApprovals(runId, undefined, endTime);
        entry.status = 'failed';
        entry.endTime = endTime;
        this.closeCurrentPhase(entry, endTime);
        this.cancelLiveDispatches(entry, endTime);
        // Script-derived failure text rides into the snapshot, the /workflows
        // render, and the completion-notification XML: normalize it once at
        // this boundary and persist the same string in both projections.
        entry.error = stripAnsiAndControl(message).slice(0, 4_096);
        this.appendEvent(entry, {
            type: 'workflow-failed',
            at: endTime,
            error: entry.error,
        });
        entry.notified = true;
        this.emitStatusChange(entry);
        this.emitNotification(entry);
        this.emitCompletion(entry);
        this.evictTerminal();
    }
    /**
     * Mark an active entry as cancelled and abort its controller. No-op
     * if the entry has already settled — protects against an explicit
     * dialog cancel racing with the natural complete/fail path.
     */
    cancel(runId, endTime) {
        const entry = this.entries.get(runId);
        if (!entry || !isActiveWorkflowStatus(entry.status))
            return;
        this.rejectPendingApprovals(runId, undefined, endTime);
        entry.status = 'cancelled';
        entry.endTime = endTime;
        this.closeCurrentPhase(entry, endTime);
        this.cancelLiveDispatches(entry, endTime);
        this.appendEvent(entry, { type: 'workflow-cancelled', at: endTime });
        entry.notified = true;
        try {
            (this.handles.get(runId) ?? entry.abortController).abort();
        }
        catch (error) {
            debugLogger.error('Failed to abort workflow controller:', error);
        }
        this.emitStatusChange(entry);
        this.evictTerminal();
    }
    get(runId) {
        return this.entries.get(runId);
    }
    setLineage(runId, sourceRunId, startMode) {
        const entry = this.entries.get(runId);
        if (!entry)
            return false;
        entry.sourceRunId = sourceRunId;
        entry.startMode = startMode;
        this.emitStatusChange(entry);
        return true;
    }
    /** All entries (active + terminal, no filter). Iteration order = registration order. */
    list() {
        return Array.from(this.entries.values());
    }
    /**
     * R7 (wenshao): true if any entry is still actively executing.
     * Mirrors the three sibling registries' `hasUnfinalizedTasks()` /
     * `hasRunningEntries()` / `getRunning().length > 0` so the unified
     * `hasBlockingBackgroundWork()` helper (the gate `/clear` and session-
     * resume both use to refuse a switch with live work) can count
     * workflow runs the same way.
     *
     * R12 (doudouOUC): `paused` deliberately does NOT count. A paused run
     * has drained its dispatches and executes nothing, and its wall-clock
     * watchdog is suspended — if it blocked the switch, a paused-and-
     * forgotten run would block `/clear` and session switching forever
     * with no backstop to release it. Mirrors the sibling
     * `BackgroundTaskRegistry.hasRunningTasks()`, which also counts only
     * `running` (a paused background agent does not block a switch).
     * Session-switch teardown cancels paused runs via `abortAll()` before
     * `reset()` so they settle terminal instead of leaking.
     */
    hasRunningEntries() {
        for (const entry of this.entries.values()) {
            if (entry.status === 'running' || entry.status === 'pausing') {
                return true;
            }
        }
        return false;
    }
    /**
     * R7 (wenshao): drop every in-memory entry without touching
     * controllers. Mirrors `BackgroundShellRegistry.reset()` and the
     * other siblings' contract — callers (`/clear`, session-resume)
     * MUST verify via `hasRunningEntries()` first that no active
     * work exists before invoking. The companion path that aborts
     * controllers is `abortAll()`.
     */
    reset() {
        if (this.entries.size === 0)
            return;
        // Snapshot a sample entry for the statusChange callback so a single
        // subscriber notify is enough — the only consumer
        // (`useBackgroundTaskView`) ignores the entry arg and re-pulls
        // `list()` on every fire.
        const sample = this.entries.values().next().value;
        for (const entry of this.entries.values()) {
            this.rejectPendingApprovals(entry.runId);
        }
        for (const runtime of this.approvalRuntimes.values()) {
            runtime.requestController?.abort();
            this.rejectResponder(runtime.respond);
        }
        this.approvalRuntimes.clear();
        this.entries.clear();
        this.handles.clear();
        if (sample)
            this.emitStatusChange(sample);
    }
    /**
     * R7 (wenshao): cancel every active entry. Called on session/
     * Config shutdown so workflow runs don't outlive the CLI process and
     * leak orphaned dispatches. Symmetric with `BackgroundShellRegistry.
     * abortAll()` and `BackgroundTaskRegistry.abortAll()`.
     *
     * Settles each entry inline (status → 'cancelled', abort the
     * controller) and fires the status-change callback exactly once
     * after the loop — the per-entry `cancel()` path would have fired
     * the callback for every active entry, wasteful on shutdown.
     */
    abortAll() {
        const endTime = Date.now();
        let lastCancelled;
        for (const entry of Array.from(this.entries.values())) {
            if (!isActiveWorkflowStatus(entry.status))
                continue;
            this.rejectPendingApprovals(entry.runId, undefined, endTime);
            entry.status = 'cancelled';
            entry.endTime = endTime;
            this.closeCurrentPhase(entry, endTime);
            this.cancelLiveDispatches(entry, endTime);
            this.appendEvent(entry, { type: 'workflow-cancelled', at: endTime });
            entry.notified = true;
            try {
                (this.handles.get(entry.runId) ?? entry.abortController).abort();
            }
            catch (error) {
                debugLogger.error('abortAll: failed to abort workflow controller:', error);
            }
            lastCancelled = entry;
        }
        if (lastCancelled)
            this.emitStatusChange(lastCancelled);
        this.evictTerminal();
    }
    closeCurrentPhase(entry, endTime) {
        const current = entry.phaseVisits[entry.phaseVisits.length - 1];
        if (current && current.endedAt === undefined) {
            current.endedAt = endTime;
            this.appendEvent(entry, {
                type: 'phase-completed',
                at: endTime,
                phaseVisitId: current.id,
            });
        }
    }
    cancelLiveDispatches(entry, endTime) {
        for (const dispatch of entry.dispatches) {
            if (dispatch.status !== 'queued' && dispatch.status !== 'running') {
                continue;
            }
            dispatch.status = 'cancelled';
            dispatch.endedAt = endTime;
            this.appendEvent(entry, {
                type: 'dispatch-cancelled',
                at: endTime,
                dispatchId: dispatch.id,
            });
        }
    }
    appendEvent(entry, payload) {
        const lastId = entry.events.at(-1)?.id;
        const nextId = lastId ? Number(lastId.slice('event-'.length)) + 1 : 1;
        entry.events.push({
            id: `event-${nextId}`,
            ...payload,
        });
    }
    appendApprovalEvent(entry, approval, type, at) {
        const dispatchId = entry.dispatches.find((dispatch) => dispatch.subagentId === approval.subagentId)?.id;
        this.appendEvent(entry, {
            type,
            at,
            name: approval.name,
            ...(dispatchId ? { dispatchId } : {}),
        });
    }
    /**
     * Sweep terminal entries when they exceed `MAX_RETAINED_TERMINAL_WORKFLOWS`.
     * Active entries are always retained. Oldest terminal entries
     * (by `endTime`) are evicted first.
     */
    evictTerminal() {
        const terminal = this.list().filter((e) => isTerminalWorkflowStatus(e.status));
        if (terminal.length <= MAX_RETAINED_TERMINAL_WORKFLOWS)
            return;
        terminal.sort((a, b) => (a.endTime ?? 0) - (b.endTime ?? 0));
        const toEvict = terminal.slice(0, terminal.length - MAX_RETAINED_TERMINAL_WORKFLOWS);
        for (const e of toEvict) {
            this.entries.delete(e.runId);
        }
    }
    emitStatusChange(entry) {
        if (!this.statusChangeCallback)
            return;
        try {
            this.statusChangeCallback(entry);
        }
        catch (error) {
            debugLogger.error('Failed to emit workflow status change:', error);
        }
    }
    rejectPendingApprovals(runId, predicate = () => true, at = Date.now()) {
        const entry = this.entries.get(runId);
        if (!entry)
            return;
        const rejected = entry.pendingApprovals.filter(predicate);
        if (rejected.length === 0)
            return;
        const rejectedIds = new Set(rejected.map((approval) => approval.approvalId));
        for (const approval of rejected) {
            this.appendApprovalEvent(entry, approval, 'approval-settled', at);
        }
        entry.pendingApprovals = entry.pendingApprovals.filter((approval) => !rejectedIds.has(approval.approvalId));
        const runtimes = [];
        for (const approvalId of rejectedIds) {
            const runtime = this.approvalRuntimes.get(approvalId);
            this.approvalRuntimes.delete(approvalId);
            if (!runtime)
                continue;
            runtime.requestController?.abort();
            runtimes.push(runtime);
        }
        this.emitApprovalChange(entry);
        for (const runtime of runtimes)
            this.rejectResponder(runtime.respond);
    }
    rejectResponder(respond) {
        void respond(ToolConfirmationOutcome.Cancel).catch((error) => {
            debugLogger.error('Failed to reject workflow approval:', error);
        });
    }
    emitApprovalChange(entry) {
        if (!this.approvalChangeCallback)
            return;
        try {
            this.approvalChangeCallback(entry);
        }
        catch (error) {
            debugLogger.error('Failed to emit workflow approval change:', error);
        }
    }
}
function stringifyCompletionResult(result) {
    if (typeof result === 'string')
        return result;
    try {
        return JSON.stringify(result) ?? String(result);
    }
    catch {
        return `(workflow returned a non-JSON-serializable value of type ${typeof result})`;
    }
}
function normalizeWorkflowApprovalOutcome(outcome) {
    return outcome === ToolConfirmationOutcome.ProceedOnce ||
        outcome === ToolConfirmationOutcome.Cancel
        ? outcome
        : ToolConfirmationOutcome.Cancel;
}
function restrictWorkflowConfirmationDetails(details) {
    switch (details.type) {
        case 'edit':
            return {
                type: 'edit',
                title: details.title,
                fileName: details.fileName,
                filePath: details.filePath,
                fileDiff: details.fileDiff,
                originalContent: null,
                newContent: '',
                hideAlwaysAllow: true,
                hideModify: true,
                skipIdeDiff: true,
                warnings: details.warnings ? [...details.warnings] : undefined,
            };
        case 'exec':
            return {
                type: 'exec',
                title: details.title,
                command: details.command,
                rootCommand: details.rootCommand,
                hideAlwaysAllow: true,
                warnings: details.warnings ? [...details.warnings] : undefined,
            };
        case 'mcp':
            return {
                type: 'mcp',
                title: details.title,
                serverName: details.serverName,
                toolName: details.toolName,
                toolDisplayName: details.toolDisplayName,
                hideAlwaysAllow: true,
            };
        case 'info':
            return {
                type: 'info',
                title: details.title,
                prompt: details.prompt,
                renderPromptAsPlainText: details.renderPromptAsPlainText,
                urls: details.urls ? [...details.urls] : undefined,
                hideAlwaysAllow: true,
            };
        case 'plan':
        case 'ask_user_question':
            return undefined;
        default: {
            const _exhaustive = details;
            return _exhaustive;
        }
    }
}
//# sourceMappingURL=workflow-run-registry.js.map