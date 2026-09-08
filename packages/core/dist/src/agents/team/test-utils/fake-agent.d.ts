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
import { AgentEventEmitter } from '../../runtime/agent-events.js';
import { AgentStatus } from '../../runtime/agent-types.js';
import type { AgentStatsSummary } from '../../runtime/agent-statistics.js';
/**
 * Script that controls how a FakeAgent responds to lifecycle events.
 */
export interface FakeAgentScript {
    /**
     * Called when the agent receives a message (via enqueueMessage).
     * Return value controls what happens next:
     * - undefined: agent goes IDLE immediately (default)
     * - 'stay_running': agent stays RUNNING (test must manually idle)
     * - Promise: agent stays RUNNING until promise resolves, then IDLE
     */
    onMessage?: (message: string, agent: FakeAgent) => void | 'stay_running' | Promise<void>;
    /**
     * Called when the agent starts (via start()).
     */
    onStart?: (agent: FakeAgent) => void | Promise<void>;
}
/**
 * FakeAgent — deterministic test double for AgentInteractive.
 *
 * Matches the public surface that TeamManager uses: getStatus(),
 * getEventEmitter(), getError(), getLastRoundError(), getStats(),
 * enqueueMessage(), waitForCompletion(), abort(), shutdown(),
 * cancelCurrentRound().
 */
export declare class FakeAgent {
    readonly agentId: string;
    readonly agentName: string;
    private status;
    private readonly emitter;
    private readonly receivedMessages;
    private readonly pendingQueue;
    private processing;
    private drained;
    private script;
    private error;
    private lastRoundError;
    /** Resolvers waiting for a specific message count. */
    private messageWaiters;
    /** Resolvers waiting for a specific status. */
    private statusWaiters;
    /** Resolves when status reaches a terminal state. */
    private completionResolve;
    private completionPromise;
    constructor(agentId: string, agentName: string, script?: FakeAgentScript);
    /**
     * Start the agent. Transitions INITIALIZING → IDLE (or runs
     * onStart script first).
     */
    start(): Promise<void>;
    getStatus(): AgentStatus;
    getEventEmitter(): AgentEventEmitter;
    getError(): string | undefined;
    getLastRoundError(): string | undefined;
    getStats(): AgentStatsSummary;
    /**
     * Mirrors AgentInteractive's queue semantics: a message that arrives
     * while a round is in flight is queued and processed when the round
     * settles — it must NOT spin up a concurrent inline round. Messages
     * after abort()/shutdown() are silently dropped (drained queue), and
     * a terminal agent is never resurrected via setStatus(RUNNING).
     */
    enqueueMessage(message: string): void;
    private processNext;
    /**
     * Mirrors the real run loop's drain-then-settle order: queued
     * messages are processed before the agent settles to IDLE. A
     * terminal status (abort, or a script that moved to COMPLETED)
     * stops the drain — the real loop never resurrects.
     */
    private settleAfterRound;
    waitForCompletion(): Promise<void>;
    abort(): void;
    shutdown(): Promise<void>;
    cancelCurrentRound(): void;
    /** Manually transition to a status (emits STATUS_CHANGE). */
    setStatus(newStatus: AgentStatus): void;
    /**
     * Manually end the current round (RUNNING → IDLE). Messages queued
     * while the round was held open are processed first, mirroring the
     * real run loop.
     */
    goIdle(): void;
    /** All messages received via enqueueMessage(). */
    getReceivedMessages(): readonly string[];
    /** Wait until the agent has received N messages total. */
    waitForMessageCount(n: number): Promise<void>;
    /** Wait until status reaches the given value. */
    waitForStatus(target: AgentStatus): Promise<void>;
    /** Set the error string (test control). */
    setError(error: string | undefined): void;
    /** Set the lastRoundError string (test control). */
    setLastRoundError(error: string | undefined): void;
    private flushMessageWaiters;
    private flushStatusWaiters;
}
