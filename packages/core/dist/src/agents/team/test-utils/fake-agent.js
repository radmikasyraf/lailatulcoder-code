/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview FakeAgent — test double for AgentInteractive.
 *
 * Implements the subset of AgentInteractive's public surface that
 * TeamManager uses, backed by a deterministic script instead of an
 * LLM reasoning loop. Status transitions emit real STATUS_CHANGE
 * events through a real AgentEventEmitter.
 */
import { AgentEventEmitter, AgentEventType, } from '../../runtime/agent-events.js';
import { AgentStatus, isTerminalStatus } from '../../runtime/agent-types.js';
/**
 * FakeAgent — deterministic test double for AgentInteractive.
 *
 * Matches the public surface that TeamManager uses: getStatus(),
 * getEventEmitter(), getError(), getLastRoundError(), getStats(),
 * enqueueMessage(), waitForCompletion(), abort(), shutdown(),
 * cancelCurrentRound().
 */
export class FakeAgent {
    agentId;
    agentName;
    status = AgentStatus.INITIALIZING;
    emitter = new AgentEventEmitter();
    receivedMessages = [];
    pendingQueue = [];
    processing = false;
    drained = false;
    script;
    error;
    lastRoundError;
    /** Resolvers waiting for a specific message count. */
    messageWaiters = [];
    /** Resolvers waiting for a specific status. */
    statusWaiters = [];
    /** Resolves when status reaches a terminal state. */
    completionResolve;
    completionPromise;
    constructor(agentId, agentName, script = {}) {
        this.agentId = agentId;
        this.agentName = agentName;
        this.script = script;
        this.completionPromise = new Promise((resolve) => {
            this.completionResolve = resolve;
        });
    }
    // ─── Lifecycle ──────────────────────────────────────────────
    /**
     * Start the agent. Transitions INITIALIZING → IDLE (or runs
     * onStart script first).
     */
    async start() {
        if (this.script.onStart) {
            const result = this.script.onStart(this);
            if (result instanceof Promise) {
                await result;
            }
        }
        if (this.status === AgentStatus.INITIALIZING) {
            this.setStatus(AgentStatus.IDLE);
        }
    }
    // ─── AgentInteractive-compatible surface ────────────────────
    getStatus() {
        return this.status;
    }
    getEventEmitter() {
        return this.emitter;
    }
    getError() {
        return this.error;
    }
    getLastRoundError() {
        return this.lastRoundError;
    }
    getStats() {
        return {
            rounds: 0,
            totalDurationMs: 0,
            totalToolCalls: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            successRate: 0,
            inputTokens: 0,
            outputTokens: 0,
            thoughtTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            toolUsage: [],
        };
    }
    /**
     * Mirrors AgentInteractive's queue semantics: a message that arrives
     * while a round is in flight is queued and processed when the round
     * settles — it must NOT spin up a concurrent inline round. Messages
     * after abort()/shutdown() are silently dropped (drained queue), and
     * a terminal agent is never resurrected via setStatus(RUNNING).
     */
    enqueueMessage(message) {
        if (this.drained || isTerminalStatus(this.status))
            return;
        this.pendingQueue.push(message);
        if (!this.processing) {
            this.processNext();
        }
    }
    processNext() {
        const message = this.pendingQueue.shift();
        if (message === undefined)
            return;
        this.processing = true;
        this.receivedMessages.push(message);
        this.flushMessageWaiters();
        this.setStatus(AgentStatus.RUNNING);
        if (this.script.onMessage) {
            const result = this.script.onMessage(message, this);
            if (result === 'stay_running') {
                // Test controls when to go idle via goIdle(); `processing`
                // stays armed so queued messages wait for it, like the real
                // run loop mid-round.
                return;
            }
            if (result instanceof Promise) {
                void result.then(() => this.settleAfterRound());
                return;
            }
        }
        this.settleAfterRound();
    }
    /**
     * Mirrors the real run loop's drain-then-settle order: queued
     * messages are processed before the agent settles to IDLE. A
     * terminal status (abort, or a script that moved to COMPLETED)
     * stops the drain — the real loop never resurrects.
     */
    settleAfterRound() {
        this.processing = false;
        if (this.drained || isTerminalStatus(this.status))
            return;
        if (this.pendingQueue.length > 0) {
            this.processNext();
            return;
        }
        if (this.status === AgentStatus.RUNNING) {
            this.setStatus(AgentStatus.IDLE);
        }
    }
    async waitForCompletion() {
        if (isTerminalStatus(this.status))
            return;
        return this.completionPromise;
    }
    abort() {
        this.drained = true;
        this.pendingQueue.length = 0;
        if (!isTerminalStatus(this.status)) {
            this.setStatus(AgentStatus.CANCELLED);
        }
    }
    async shutdown() {
        this.drained = true;
        if (!isTerminalStatus(this.status)) {
            this.setStatus(AgentStatus.COMPLETED);
        }
    }
    cancelCurrentRound() {
        if (this.status === AgentStatus.RUNNING) {
            this.setStatus(AgentStatus.IDLE);
        }
    }
    // ─── Test control ───────────────────────────────────────────
    /** Manually transition to a status (emits STATUS_CHANGE). */
    setStatus(newStatus) {
        const previousStatus = this.status;
        if (previousStatus === newStatus)
            return;
        this.status = newStatus;
        this.emitter.emit(AgentEventType.STATUS_CHANGE, {
            agentId: this.agentId,
            previousStatus,
            newStatus,
            timestamp: Date.now(),
        });
        this.flushStatusWaiters();
        if (isTerminalStatus(newStatus)) {
            this.completionResolve?.();
        }
    }
    /**
     * Manually end the current round (RUNNING → IDLE). Messages queued
     * while the round was held open are processed first, mirroring the
     * real run loop.
     */
    goIdle() {
        if (this.status === AgentStatus.RUNNING) {
            this.settleAfterRound();
        }
    }
    /** All messages received via enqueueMessage(). */
    getReceivedMessages() {
        return this.receivedMessages;
    }
    /** Wait until the agent has received N messages total. */
    waitForMessageCount(n) {
        if (this.receivedMessages.length >= n) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.messageWaiters.push({ count: n, resolve });
        });
    }
    /** Wait until status reaches the given value. */
    waitForStatus(target) {
        if (this.status === target) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.statusWaiters.push({ target, resolve });
        });
    }
    /** Set the error string (test control). */
    setError(error) {
        this.error = error;
    }
    /** Set the lastRoundError string (test control). */
    setLastRoundError(error) {
        this.lastRoundError = error;
    }
    // ─── Private ────────────────────────────────────────────────
    flushMessageWaiters() {
        const pending = this.messageWaiters;
        this.messageWaiters = [];
        for (const w of pending) {
            if (this.receivedMessages.length >= w.count) {
                w.resolve();
            }
            else {
                this.messageWaiters.push(w);
            }
        }
    }
    flushStatusWaiters() {
        const pending = this.statusWaiters;
        this.statusWaiters = [];
        for (const w of pending) {
            if (this.status === w.target) {
                w.resolve();
            }
            else {
                this.statusWaiters.push(w);
            }
        }
    }
}
//# sourceMappingURL=fake-agent.js.map