/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview AgentInteractive — persistent interactive agent.
 *
 * Composes AgentCore with on-demand message processing. Builds conversation
 * state (messages, pending approvals, live outputs) that the UI reads.
 */
import { createAbortController, createChildAbortController, } from '../../utils/abortController.js';
import { childLaunchDepth, runWithAgentContext } from './agent-context.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
import { AgentEventType } from './agent-events.js';
import { ToolConfirmationOutcome, } from '../../tools/tools.js';
import { AsyncMessageQueue } from '../../utils/asyncMessageQueue.js';
import { AgentTerminateMode, AgentStatus, isTerminalStatus, } from './agent-types.js';
const debugLogger = createDebugLogger('AGENT_INTERACTIVE');
/**
 * AgentInteractive — persistent interactive agent that processes
 * messages on demand.
 *
 * Three-level cancellation:
 * - `cancelCurrentRound()` — abort the current reasoning loop only
 * - `shutdown()` — graceful: stop accepting messages, wait for cycle
 * - `abort()` — immediate: master abort, set cancelled
 */
export class AgentInteractive {
    config;
    core;
    queue = new AsyncMessageQueue();
    /**
     * This agent's nesting depth, captured from the spawner's ambient frame at
     * construction (0 when spawned from the top-level session). start() and
     * runLoop() re-enter the agent identity frame pinned at this depth, so
     * prepareTools()' depth gating and the AgentTool's runtime guards see an
     * in-process interactive agent (Arena, in-process teammate) as an agent —
     * not as the top-level session. Pinning (rather than auto-increment)
     * matters because runLoop() restarts itself from its own finally block and
     * enqueueMessage() may be called from arbitrary chains.
     */
    agentDepth;
    status = AgentStatus.INITIALIZING;
    error;
    lastRoundError;
    executionPromise;
    masterAbortController = createAbortController();
    roundAbortController;
    chat;
    toolsList = [];
    processing = false;
    roundCancelledByUser = false;
    // Wall-clock timestamp when each currently-executing tool transitioned into
    // the scheduler's `executing` state. Keyed by callId. First TOOL_OUTPUT_UPDATE
    // carrying executionStartTime wins; later events that re-carry it are ignored
    // so the timer is stable. Lives on InteractiveAgent (not AgentCore) because
    // it's only consumed by the interactive UI's elapsed-time indicator.
    executionStartTimes = new Map();
    constructor(config, core) {
        this.config = config;
        this.core = core;
        // Ambient capture: reads the SPAWNER's AsyncLocalStorage frame, so this
        // is correct only while construction stays on the spawner's await chain
        // (today: InProcessBackend.spawnAgent, whose entry paths are top-level
        // gated). A future factory/queue/deferred construction would silently
        // record depth 0 — the same deferral-loses-frame failure the resume
        // path solves explicitly by persisting AgentMeta.depth. If construction
        // ever moves off the spawn chain, thread the depth through
        // AgentInteractiveConfig instead.
        this.agentDepth = childLaunchDepth();
        this.setupEventListeners();
    }
    // ─── Lifecycle ──────────────────────────────────────────────
    /**
     * Start the agent. Initializes the chat session, then kicks off
     * processing if an initialTask is configured. Runs inside this agent's
     * identity frame so prepareTools() depth-gates the AgentTool correctly
     * (see agentDepth).
     */
    start(context) {
        return runWithAgentContext(this.config.agentId, () => this.startInner(context), this.agentDepth);
    }
    async startInner(context) {
        this.setStatus(AgentStatus.INITIALIZING);
        this.chat = await this.core.createChat(context, {
            interactive: true,
            extraHistory: this.config.chatHistory,
        });
        if (!this.chat) {
            this.error = 'Failed to create chat session';
            this.setStatus(AgentStatus.FAILED);
            return;
        }
        this.toolsList = await this.core.prepareTools();
        this.core.stats.start(Date.now());
        if (this.config.chatHistory?.length) {
            this.addMessage('info', `History context from parent session included (${this.config.chatHistory.length} messages)`);
        }
        if (this.config.initialTask) {
            this.queue.enqueue(this.config.initialTask);
            this.executionPromise = this.startRunLoop();
        }
    }
    /**
     * Run loop: process all pending messages, then settle status.
     * Exits when the queue is empty or the agent is aborted. Runs inside this
     * agent's identity frame (pinned at agentDepth) so tool bodies — including
     * a nested `agent` spawn and its depth guard — attribute to this agent
     * rather than the top-level session.
     */
    runLoop() {
        return runWithAgentContext(this.config.agentId, () => this.runLoopInner(), this.agentDepth);
    }
    async runLoopInner() {
        this.processing = true;
        try {
            let message = this.queue.dequeue();
            while (message !== null && !this.masterAbortController.signal.aborted) {
                this.addMessage('user', message);
                await this.runOneRound(message);
                message = this.queue.dequeue();
            }
            if (this.masterAbortController.signal.aborted) {
                this.setStatus(AgentStatus.CANCELLED);
            }
            else {
                this.settleRoundStatus();
            }
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
            this.setStatus(AgentStatus.FAILED);
            debugLogger.error('AgentInteractive processing failed:', err);
        }
        finally {
            this.processing = false;
            // A message enqueued during the synchronous IDLE STATUS_CHANGE
            // emit (e.g. TeamManager flushing a held message the moment the
            // agent settles) arrives after the dequeue loop's final empty
            // check but while `processing` is still true — enqueueMessage
            // sees the loop as live and won't restart it, stranding the
            // message in the queue. Re-check here, after the flag flips.
            // The sync prefix of the restarted loop re-arms `processing`
            // before any interleaved enqueueMessage can observe it false,
            // so the two restart paths can't double-run.
            if (this.queue.size > 0 &&
                !this.masterAbortController.signal.aborted &&
                !isTerminalStatus(this.status)) {
                this.executionPromise = this.startRunLoop();
            }
        }
    }
    /**
     * Run a single reasoning round for one message.
     * Creates a per-round AbortController so cancellation is scoped.
     */
    async runOneRound(message) {
        if (!this.chat)
            return;
        this.setStatus(AgentStatus.RUNNING);
        this.lastRoundError = undefined;
        this.roundCancelledByUser = false;
        this.roundAbortController = createChildAbortController(this.masterAbortController);
        try {
            const initialMessages = [
                { role: 'user', parts: [{ text: message }] },
            ];
            const result = await this.core.runReasoningLoop(this.chat, initialMessages, this.toolsList, this.roundAbortController, {
                maxTurns: this.config.maxTurnsPerMessage,
                maxTimeMinutes: this.config.maxTimeMinutesPerMessage,
            });
            // Surface non-normal termination as a visible info message and as
            // lastRoundError so Arena can distinguish limit stops from successes.
            if (result.terminateMode &&
                result.terminateMode !== AgentTerminateMode.GOAL) {
                const msg = terminateModeMessage(result.terminateMode);
                if (msg) {
                    this.addMessage('info', msg.text, { metadata: { level: msg.level } });
                }
                this.lastRoundError = `Terminated: ${result.terminateMode}`;
            }
        }
        catch (err) {
            // User-initiated cancellation already logged by cancelCurrentRound().
            if (this.roundCancelledByUser)
                return;
            // Agent survives round errors — log and settle status in runLoop.
            const errorMessage = err instanceof Error ? err.message : String(err);
            this.lastRoundError = errorMessage;
            debugLogger.error('AgentInteractive round error:', err);
            this.addMessage('info', errorMessage, { metadata: { level: 'error' } });
        }
        finally {
            // Helper's reverse-cleanup detaches the parent listener automatically
            // when the round controller aborts; abort here so cleanup fires whether
            // or not the round was already cancelled.
            this.roundAbortController?.abort();
            this.roundAbortController = undefined;
        }
    }
    // ─── Cancellation ──────────────────────────────────────────
    /**
     * Cancel only the current reasoning round.
     * Adds a visible "cancelled" info message and clears pending approvals.
     */
    cancelCurrentRound() {
        this.roundCancelledByUser = true;
        this.roundAbortController?.abort();
        this.core.clearPendingApprovals();
        this.addMessage('info', 'Agent round cancelled.', {
            metadata: { level: 'warning' },
        });
    }
    /**
     * Graceful shutdown: stop accepting messages and wait for current
     * processing to finish.
     */
    async shutdown() {
        this.queue.drain();
        if (this.executionPromise) {
            await this.executionPromise;
        }
        // If no processing cycle ever ran (no initialTask, no messages),
        // ensure the agent reaches a terminal status.
        if (!isTerminalStatus(this.status)) {
            this.setStatus(AgentStatus.COMPLETED);
        }
    }
    /**
     * Immediate abort: cancel everything and set status to cancelled.
     */
    abort() {
        this.masterAbortController.abort();
        this.queue.drain();
        this.core.clearPendingApprovals();
        // When no run loop is in flight (idle/initializing agent), nothing
        // will ever observe the aborted signal and settle status — the
        // agent would sit non-terminal forever and lifecycle gates like
        // TeamManager's allTeammatesTerminated() would never fire. Settle
        // it here; a live loop exits via its own aborted check instead.
        if (!this.processing && !isTerminalStatus(this.status)) {
            this.setStatus(AgentStatus.CANCELLED);
        }
    }
    // ─── Message Queue ─────────────────────────────────────────
    /**
     * Enqueue a message for the agent to process.
     */
    enqueueMessage(message) {
        this.queue.enqueue(message);
        if (!this.processing) {
            this.executionPromise = this.startRunLoop();
        }
    }
    // ─── State Accessors (delegates to AgentCore) ──────────────
    getMessages() {
        return this.core.getMessages();
    }
    getStatus() {
        return this.status;
    }
    getError() {
        return this.error;
    }
    getLastRoundError() {
        return this.lastRoundError;
    }
    getStats() {
        return this.core.getExecutionSummary();
    }
    /** The prompt token count from the most recent model call. */
    getLastPromptTokenCount() {
        return this.core.lastPromptTokenCount;
    }
    getCore() {
        return this.core;
    }
    getEventEmitter() {
        return this.core.getEventEmitter();
    }
    /**
     * Returns tool calls currently awaiting user approval.
     * Keyed by callId → full ToolCallConfirmationDetails (with onConfirm).
     * The UI reads this to render confirmation dialogs inside ToolGroupMessage.
     */
    getPendingApprovals() {
        return this.core.getPendingApprovals();
    }
    /**
     * Returns live output for currently-executing tools.
     * Keyed by callId → latest ToolResultDisplay (replaces on each update).
     * Entries are cleared when TOOL_RESULT arrives for the call.
     */
    getLiveOutputs() {
        return this.core.getLiveOutputs();
    }
    /**
     * Returns PTY PIDs for currently-executing interactive shell tools.
     * Keyed by callId → PID. Populated from TOOL_OUTPUT_UPDATE when pid is
     * present; cleared when TOOL_RESULT arrives. The UI uses this to enable
     * interactive shell input via HistoryItemDisplay's activeShellPtyId prop.
     */
    getShellPids() {
        return this.core.getShellPids();
    }
    /**
     * Returns wall-clock start timestamps (ms since epoch) for currently-
     * executing tools, from the scheduler's `→ executing` transition.
     * Keyed by callId; entries are cleared when TOOL_RESULT arrives. The UI
     * uses this to render an elapsed-time indicator that excludes approval
     * and scheduling wait.
     */
    getExecutionStartTimes() {
        return this.executionStartTimes;
    }
    /**
     * Wait for the run loop to finish (used by InProcessBackend).
     */
    async waitForCompletion() {
        if (this.executionPromise) {
            await this.executionPromise;
        }
    }
    // ─── Private Helpers ───────────────────────────────────────
    startRunLoop() {
        if (this.config.runInContext) {
            return this.config.runInContext(() => this.runLoop());
        }
        return this.runLoop();
    }
    /**
     * Settle status after the run loop empties.
     * On success → IDLE (agent stays alive for follow-up messages).
     * On error → FAILED (terminal).
     */
    settleRoundStatus() {
        if (this.lastRoundError && !this.roundCancelledByUser) {
            this.setStatus(AgentStatus.FAILED);
        }
        else if (this.config.completeOnIdle) {
            this.setStatus(AgentStatus.COMPLETED);
        }
        else {
            this.setStatus(AgentStatus.IDLE);
        }
    }
    setStatus(newStatus) {
        const previousStatus = this.status;
        if (previousStatus === newStatus)
            return;
        this.status = newStatus;
        this.core.eventEmitter?.emit(AgentEventType.STATUS_CHANGE, {
            agentId: this.config.agentId,
            previousStatus,
            newStatus,
            roundCancelledByUser: this.roundCancelledByUser || undefined,
            timestamp: Date.now(),
        });
    }
    addMessage(role, content, options) {
        this.core.pushMessage(role, content, options);
    }
    /**
     * Wraps TOOL_WAITING_APPROVAL's onConfirm so a Cancel outcome aborts
     * the current round (headless agents bypass this path entirely).
     * Core already owns the message / live-output / shell-PID listeners.
     */
    setupEventListeners() {
        const emitter = this.core.eventEmitter;
        emitter.on(AgentEventType.TOOL_OUTPUT_UPDATE, (event) => {
            if (event.executionStartTime !== undefined &&
                !this.executionStartTimes.has(event.callId)) {
                this.executionStartTimes.set(event.callId, event.executionStartTime);
            }
        });
        emitter.on(AgentEventType.TOOL_RESULT, (event) => {
            this.executionStartTimes.delete(event.callId);
        });
        emitter.on(AgentEventType.TOOL_WAITING_APPROVAL, (event) => {
            const fullDetails = {
                ...event.confirmationDetails,
                onConfirm: async (outcome, payload) => {
                    this.core.deletePendingApproval(event.callId);
                    // Nudge the UI to re-render so the tool transitions visually
                    // from Confirming → Executing without waiting for the first
                    // real TOOL_OUTPUT_UPDATE from the tool's execution.
                    this.core.eventEmitter.emit(AgentEventType.TOOL_OUTPUT_UPDATE, {
                        subagentId: this.core.subagentId,
                        round: event.round,
                        callId: event.callId,
                        outputChunk: '',
                        timestamp: Date.now(),
                    });
                    await event.respond(outcome, payload);
                    // When the user denies a tool, cancel the round immediately
                    // so the agent doesn't waste a turn "acknowledging" the denial.
                    if (outcome === ToolConfirmationOutcome.Cancel) {
                        this.cancelCurrentRound();
                    }
                },
            };
            this.core.setPendingApproval(event.callId, fullDetails);
        });
    }
}
/**
 * Map a non-GOAL terminate mode to a visible status message for the UI,
 * or return null to suppress the message entirely.
 *
 * CANCELLED is suppressed here because cancelCurrentRound() already emits
 * its own warning. SHUTDOWN is suppressed as a normal lifecycle end.
 */
function terminateModeMessage(mode) {
    switch (mode) {
        case AgentTerminateMode.MAX_TURNS:
            return {
                text: 'Agent stopped: maximum turns reached.',
                level: 'warning',
            };
        case AgentTerminateMode.TIMEOUT:
            return { text: 'Agent stopped: time limit reached.', level: 'warning' };
        case AgentTerminateMode.ERROR:
            return { text: 'Agent stopped due to an error.', level: 'error' };
        case AgentTerminateMode.LOOP_DETECTED:
            return {
                text: 'Agent stopped: duplicate tool-call loop detected.',
                level: 'error',
            };
        case AgentTerminateMode.CANCELLED:
        case AgentTerminateMode.SHUTDOWN:
            return null;
        default:
            return null;
    }
}
//# sourceMappingURL=agent-interactive.js.map