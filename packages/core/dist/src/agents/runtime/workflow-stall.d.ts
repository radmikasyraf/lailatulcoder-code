/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Stall watchdog + retry for workflow agent dispatches. A
 * workflow `agent()` can hang indefinitely if the model loops, the provider
 * stalls mid-stream, or a tool never returns. The subagent's own
 * `max_time_minutes` (10 min) is a coarse backstop; the stall watchdog is
 * finer-grained: it aborts a dispatch after `stallMs` (default 60s) of NO
 * observable progress, and the resilient wrapper retries up to
 * `MAX_STALL_ATTEMPTS` times before abandoning.
 *
 * "Progress" = any of the subagent's reasoning-loop events (round start,
 * streamed text, token usage, tool call/result). Crucially the timer is
 * SUSPENDED while a tool is in flight: a legitimately long-running tool
 * (a 90s shell build, a slow MCP call) must not be flagged as a stall. The
 * timer only counts wall-clock during which the subagent is producing
 * nothing AND has no tool executing.
 *
 * Design (low-invasiveness): the resilient wrapper owns the per-attempt
 * `AbortController` and `AgentEventEmitter`. It chains the caller's parent
 * signal into the per-attempt controller (so parent cancellation still
 * propagates) and passes BOTH the per-attempt signal and emitter into the
 * single-attempt dispatch. A stall fires `controller.abort('stalled')`,
 * which makes the subagent return `CANCELLED`; the single-attempt dispatch
 * then throws its "did not complete" terminal, which the wrapper catches.
 * The wrapper distinguishes a stall-abort (retry) from a parent-abort
 * (propagate) via `watchdog.stalled()` + the parent `signal.aborted` flag.
 *
 * Schema-mode rescue happens for free: if a stall fires AFTER the subagent
 * already captured a valid `structured_output`, the single-attempt dispatch
 * returns that payload BEFORE reaching the terminate-mode check, so the
 * wrapper sees a success and never retries.
 */
import { AgentEventEmitter } from './agent-events.js';
/** Default stall timeout: 60s of no progress (with no tool in flight). */
export declare const DEFAULT_STALL_MS = 60000;
/** Total attempts (initial + retries) for a single `agent()` dispatch. */
export declare const MAX_STALL_ATTEMPTS = 3;
export declare const MAX_WORKFLOW_STALL_MS_ENV = "QWEN_CODE_WORKFLOW_STALL_SECONDS";
/**
 * Resolve the per-dispatch stall timeout. Precedence: the per-call
 * `agent({stallMs})` override, then `QWEN_CODE_WORKFLOW_STALL_SECONDS`
 * (whole seconds), then `DEFAULT_STALL_MS`. A non-positive / non-finite
 * override falls back to the default. A value of `0` disables the watchdog
 * (returns `0` — callers treat 0 as "no watchdog").
 */
export declare function resolveStallMs(perCall: number | undefined, env?: Record<string, string | undefined>): number;
export interface StallWatchdogHandle {
    /** True once the watchdog has fired `controller.abort('stalled')`. */
    stalled(): boolean;
    /** Clear the timer + detach listeners. Idempotent; call in a `finally`. */
    dispose(): void;
}
/**
 * Attach a stall watchdog to a subagent's event emitter. The watchdog arms
 * a `stallMs` timer that any progress event resets; while a tool is in
 * flight the timer is held (a long tool call is not a stall). When the
 * timer elapses with no in-flight tool, it fires `controller.abort('stalled')`.
 *
 * The watchdog arms on the FIRST progress event, not at attach time. The
 * time-to-first-response window — connection setup, server-side queueing, and
 * a reasoning model's pre-first-token thinking — emits no events (`ROUND_START`
 * fires only AFTER `await sendMessageStream` resolves), so counting it would
 * false-trip on a healthy-but-slow first response and waste 3× tokens on the
 * retry loop. That window is instead bounded by the subagent's own
 * `max_time_minutes`; the watchdog's job is post-first-response streaming stalls.
 *
 * A `stallMs` of 0 means "no watchdog" — this returns an inert handle.
 */
export declare function attachStallWatchdog(emitter: AgentEventEmitter, controller: AbortController, stallMs: number): StallWatchdogHandle;
/**
 * One single-attempt dispatch. Receives the per-attempt abort signal (the
 * wrapper chains the parent signal into it + the watchdog aborts it) and
 * the per-attempt emitter (the watchdog is already attached). Returns the
 * agent result on success; throws on any non-success terminal.
 */
export type StallAttemptFn<T> = (attemptSignal: AbortSignal, emitter: AgentEventEmitter) => Promise<T>;
export interface RunStallResilientOptions {
    stallMs: number;
    /** Caller's parent abort signal (cancellation, wall-clock). */
    signal?: AbortSignal;
    /** For the abandoned-error message. */
    label?: string;
}
/**
 * Run a single-attempt dispatch under the stall watchdog, retrying on stall
 * up to `MAX_STALL_ATTEMPTS`. A non-stall failure (MAX_TURNS, TIMEOUT,
 * ERROR, schema-nudge-exhaustion) propagates immediately without retry —
 * those are deterministic outcomes a retry won't fix. A parent abort
 * propagates without retry.
 *
 * The watchdog is disabled (no retries, raw single attempt) when
 * `stallMs <= 0`.
 */
export declare function runStallResilient<T>(attemptFn: StallAttemptFn<T>, opts: RunStallResilientOptions): Promise<T>;
