/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { WorkflowBudget } from './workflow-sandbox.js';
export declare const MAX_TOKENS_PER_WORKFLOW_ENV = "QWEN_CODE_MAX_TOKENS_PER_WORKFLOW";
/**
 * Absolute upper bound on the env-override token cap. Even an operator
 * who sets `QWEN_CODE_MAX_TOKENS_PER_WORKFLOW=999999999` cannot exceed
 * this — protects against a fat-finger / misconfig that would silently
 * uncap a workflow. 100M tokens is roughly 20× the largest legitimate
 * single-workflow envelope (5M tokens × heavy ultracode pass).
 */
export declare const HARD_MAX_TOKENS_CEILING = 100000000;
/**
 * Resolve the per-run output-token ceiling, honoring
 * `QWEN_CODE_MAX_TOKENS_PER_WORKFLOW`. Returns `null` when the env is
 * unset or empty — null is the "no target" sentinel that
 * `budget.total === null` consumers gate on.
 *
 * A non-integer override, a value `< 1` (notably `0` and negative
 * numbers), or a non-numeric string is rejected with a debug warning
 * and falls back to `null` — i.e. treated as "no cap" rather than
 * crashing. This matches the `resolveMaxAgentsPerRun` fall-back policy
 * and means `QWEN_CODE_MAX_TOKENS_PER_WORKFLOW=0` does NOT disable
 * workflows; operators wanting "no agents may run" should disable the
 * tool entirely via `QWEN_CODE_DISABLE_WORKFLOWS=1` instead. An
 * override above `HARD_MAX_TOKENS_CEILING` is clamped (with a debug
 * warning).
 */
export declare function resolveMaxTokensPerWorkflow(env?: Record<string, string | undefined>): number | null;
/**
 * Per-run output-token tracker. Single instance lives in the orchestrator
 * across the lifetime of one `run()` call. The orchestrator's
 * `countedDispatch` reads `remaining()` to gate dispatches and calls
 * `recordSpent()` after each agent completion.
 *
 * `total` is set once at construction from
 * `resolveMaxTokensPerWorkflow()`; subsequent mutations are forbidden
 * (the field is `readonly` from the script's perspective — there is no
 * setter on `WorkflowBudget`).
 *
 * Threading: workflows are single-threaded JS, so the counter has no
 * synchronisation primitive — every `recordSpent` happens on the host
 * event loop between dispatch resolutions.
 */
export declare class WorkflowBudgetImpl implements WorkflowBudget {
    readonly total: number | null;
    private _spent;
    constructor(total: number | null);
    spent(): number;
    remaining(): number;
    /**
     * Host-side increment. NOT exposed to the script — the
     * `WorkflowBudget` interface deliberately omits any setter so a
     * malicious workflow cannot inflate / deflate the budget. Only the
     * orchestrator (in `countedDispatch`) calls this after a dispatch
     * resolves with the agent's output token count.
     *
     * Non-positive deltas are silently dropped (some dispatches return
     * `output_tokens: 0` on early failures); negative deltas would be a
     * caller bug and are also dropped rather than silently rewinding
     * the counter.
     */
    recordSpent(deltaTokens: number): void;
    /**
     * Factory: build a budget from the current environment. Convenience
     * over `new WorkflowBudgetImpl(resolveMaxTokensPerWorkflow(env))`.
     */
    static fromEnv(env?: Record<string, string | undefined>): WorkflowBudgetImpl;
}
/**
 * Thrown when an `agent()` dispatch would exceed `budget.total`. The
 * orchestrator's `countedDispatch` checks `budget.remaining() > 0`
 * BEFORE invoking the dispatch — once thrown, no further LLM calls
 * happen for this run. The script-side catch (if any) sees this as a
 * regular rejection from `await agent(...)`.
 *
 * Carries `runId` so the catch-arm display can identify the offending
 * workflow without parsing the message; `budgetTotal` and `spent`
 * snapshot the budget state at throw-time so logging / UI can render
 * the precise overshoot.
 *
 * Production callers (`WorkflowTool`) format the error message for the
 * LLM-facing tool result via `extractErrorMessage` (the duck-typed
 * extractor — cross-realm `instanceof` is unreliable in the vm-realm
 * sandbox, so we keep the message string self-describing rather than
 * relying on `err.name`).
 */
export declare class WorkflowBudgetExceededError extends Error {
    readonly name = "WorkflowBudgetExceededError";
    readonly runId: string;
    readonly budgetTotal: number;
    readonly spent: number;
    constructor(runId: string, budgetTotal: number, spent: number);
}
