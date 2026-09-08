/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Run-level budget enforcement for headless / non-interactive LailatulCoder Ai
 * sessions. See issue LailatulCoder/lailatul-coder#4103.
 *
 * Two budgets are enforced today:
 *  - `--max-wall-time` / `model.maxWallTimeSeconds` — clock-time guardrail
 *    for long-running unattended runs.
 *  - `--max-tool-calls` / `model.maxToolCalls` — bounds the cumulative
 *    number of tool executions (success or failure).
 *
 * `tickToolCall()` is invoked **before** each `executeToolCall` so that a
 * budget of N caps the run at exactly N executions — the (N+1)th tick
 * aborts before the work is performed. The wall-clock timer is started via
 * `start()` and torn down by `stop()`. When any limit is exceeded the
 * enforcer aborts the run via the shared `AbortController` and records the
 * reason so the caller can emit a structured error envelope.
 */
export type BudgetKind = 'wall-time' | 'tool-calls';
export interface BudgetExceeded {
    kind: BudgetKind;
    limit: number;
    /** Observed value at the moment the budget was exceeded. */
    observed: number;
    /** Human-readable message suitable for stderr / structured error output. */
    message: string;
}
export interface RunBudgetOptions {
    /**
     * Wall-clock budget in seconds. Non-positive (`-1`, `0`, undefined)
     * disables the budget; the CLI parser rejects `0` at the input layer so
     * this enforcer never sees a legitimate "zero seconds" value.
     */
    maxWallTimeSeconds?: number;
    /**
     * Max cumulative tool calls. `-1` / `undefined` disables; `0` is a valid
     * budget meaning "no tool calls allowed" (the first tick aborts).
     */
    maxToolCalls?: number;
}
/**
 * Parses a duration string used by `--max-wall-time`.
 *
 * Accepted forms (all must resolve to a duration in
 * `[MIN_WALL_TIME_SECONDS, MAX_WALL_TIME_SECONDS]`):
 *   - plain number (interpreted as seconds): `"90"` → 90
 *   - suffixed: `"30s"`, `"5m"`, `"1h"`, `"1.5h"`, `"3600s"`
 *   - `ms` suffix is syntactically accepted but rejected at the floor
 *     unless the value resolves to `>= 1s` (e.g. `"1000ms"` is legal,
 *     `"500ms"` is not)
 *   - case-insensitive suffix; whitespace tolerated
 *
 * Returns the duration in **seconds** for parity with `maxWallTimeSeconds`
 * in settings.json.
 *
 * Throws on garbage input, on negative values (regex-rejected — no sign
 * allowed), on zero, on sub-second values below `MIN_WALL_TIME_SECONDS`,
 * and on values above `MAX_WALL_TIME_SECONDS`. A typo in a CI budget flag
 * should fail loud at startup, not silently disable (or instant-fire) the
 * guardrail.
 */
export declare function parseDurationSeconds(input: string): number;
/**
 * Validates a `maxWallTimeSeconds` value sourced from settings.json
 * (as opposed to the CLI flag, which goes through `parseDurationSeconds`).
 *
 * The settings entry is a plain number, so the CLI's parser doesn't run.
 * Mirror the same rejection rules here so `maxWallTimeSeconds: 0` in
 * settings.json doesn't silently disable the budget (the enforcer treats
 * `<= 0` as "no timer") while the equivalent `--max-wall-time 0` flag is
 * fatal. Asymmetry would be a foot-gun.
 *
 * Returns the validated value, or `-1` for the "unlimited" sentinel.
 */
export declare function validateMaxWallTimeSetting(value: number): number;
/**
 * Validates a `maxToolCalls` value sourced from either the `--max-tool-calls`
 * CLI flag or `model.maxToolCalls` in settings.json. Mirrors
 * `validateMaxWallTimeSetting`: the enforcer treats anything `< 0` as "no
 * limit", so any non-`-1` negative would silently disable the budget. Reject
 * up front to keep the fail-loud philosophy symmetric across all budgets.
 *
 * `0` IS legal here — it means "no tool calls allowed; first tick aborts"
 * (asymmetric with wall-time where 0 is fatal). Documented in the schema.
 */
export declare function validateMaxToolCalls(value: number): number;
export declare class RunBudgetEnforcer {
    private readonly maxWallTimeSeconds;
    private readonly maxToolCalls;
    private readonly abortController;
    private wallTimer;
    private toolCallCount;
    private exceeded;
    constructor(opts: RunBudgetOptions, abortController: AbortController);
    /**
     * Starts the wall-clock timer (if configured). Idempotent so callers
     * don't need to thread "did I already start?" state.
     */
    start(): void;
    /** Records one tool execution and enforces `maxToolCalls`. */
    tickToolCall(): void;
    /**
     * Returns the budget-exceeded record if one fired, else null. The
     * non-interactive loop checks this after `abortController.signal`
     * fires to distinguish "budget abort" from "user SIGINT" so it can
     * emit a structured-error envelope with the right reason.
     */
    getExceeded(): BudgetExceeded | null;
    /** Cancels the wall-clock timer. Safe to call multiple times. */
    stop(): void;
    private markExceeded;
}
