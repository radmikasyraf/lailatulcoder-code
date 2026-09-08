/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * The shell tool's own hard maximum, which the agent's brief welds onto every
 * long review command (`build-test`, `test-efficacy`). Exported so the briefs
 * and the budget below quote ONE number: they were separately-maintained
 * copies, and the budget's "30s of headroom under the 600-second tool timeout"
 * comment was the only thing tying them together.
 */
export declare const SHELL_TOOL_MAX_TIMEOUT_MS = 600000;
/**
 * Headroom between the whole-call budget and the tool timeout: process start,
 * the report write, and the drift between the shell's clock and node's.
 */
export declare const BUILD_TEST_BUDGET_HEADROOM_S = 30;
/** The default whole-call budget: everything the ceiling leaves usable. */
export declare const DEFAULT_WHOLE_CALL_BUDGET_S: number;
/**
 * The default per-command deadline — large enough for the slowest single
 * command a review of this repo runs (401s, measured above), and still inside
 * the whole-call budget with headroom to spare.
 */
export declare const DEFAULT_COMMAND_TIMEOUT_S = 540;
/**
 * How many `--resume` continuations a review may spend before it reports what
 * it has. Four calls of ten minutes is the point where the build-and-test
 * dimension stops being cheaper than the reviewer's attention; past it, the
 * honest answer is the disclosure `notRun` already carries.
 */
export declare const MAX_RESUME_CALLS = 3;
