/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type ReviewToolchainAdapter } from './lib/toolchain.js';
import { type TestScope } from './lib/workspace-scope.js';
/**
 * The root toolchains build-test can select. One today; the registry exists so
 * the next one is a registration rather than another branch in this file.
 */
export declare const toolchainAdapters: readonly ReviewToolchainAdapter[];
/** A command this run actually executed, and what it did. */
export interface CommandResult {
    command: string;
    /** `null` when the command was killed by the deadline. */
    exitCode: number | null;
    seconds: number;
    timedOut: boolean;
    /** Trimmed output: enough to correlate a failure with the diff. */
    output: string;
    /**
     * Test files the runner named as failing, measured off the UNTRIMMED output
     * at capture time. Absent when the command named none.
     *
     * `output` is bounded, and a failing suite's FAIL lines do not fit inside the
     * bound: measured on a live review of PR #9113, a `packages/core` run whose
     * rescued summary line read `Test Files  11 failed` reached `test-delta` with
     * exactly ONE FAIL line still in the report. Everything downstream that
     * attributes a failure — `test-delta`'s netNew/shared sets above all — was
     * re-parsing that bounded text, so ten failing files were invisible to the
     * measurement: absent from `shared` (understating what is pre-existing) and
     * absent from `netNew` (the direction that loses a failure the PR caused).
     * The raw text exists here and nowhere else; record the set while it does.
     */
    failingFiles?: string[];
    /**
     * The deadline the command was actually given (ms) — the whole-call budget
     * shortens it below the per-command default, and the timeout note must
     * quote the number that fired, not the flag default.
     */
    deadlineMs?: number;
    /**
     * True when the deadline this command got was shortened by the whole-call
     * budget rather than being its own — i.e. it was started with less time than
     * `--timeout` allows.
     *
     * A clamped timeout is a PROVISIONAL result: the command was not too slow,
     * the call was too late. Measured on PR #9113, `npm test
     * --workspace="packages/cli"` was admitted with 286s of a 300s deadline and
     * killed — half the whole call spent to learn nothing, and the suite was
     * recorded as timed-out rather than as still-to-run, so nothing downstream
     * could retry it. `--resume` reads this flag and re-runs those commands with
     * a full deadline in the next call.
     */
    clamped?: boolean;
}
export interface BuildTestReport {
    /** The scoped toolchain that ran, or `unsupported` when selection was unsafe. */
    toolchain: 'npm' | 'unsupported';
    /** Workspace dirs the diff changed. */
    affected: string[];
    /** What was built, dependencies first — after any widening. */
    buildSet: string[];
    /**
     * Packages the whole-call budget stopped BEFORE their build ran, when that
     * happened. Structural for the same reason `notRun` is: a tree missing
     * these was never fully compiled, and consumers of this report
     * (`base-tree`'s availability gate) must be able to see that without
     * parsing prose.
     */
    notBuilt?: string[];
    /** Packages the compiler asked for that the dependency graph had not predicted. */
    widenedWith: string[];
    install: CommandResult | null;
    build: CommandResult[];
    test: CommandResult[];
    /**
     * True when the run was a deliberate `--build-only` probe. Structural,
     * because `--resume`'s nothing-to-resume answer keys on it: a probe's
     * report has no tests and no scope BY CHOICE, and without the stamp that
     * shape is indistinguishable from a completed zero-suite run.
     */
    buildOnly?: boolean;
    /**
     * True when the test phase was ENTERED and ran nothing — the whole-call
     * budget fell below the attempt floor (or the unbuilt closure covered
     * every suite) before the first test command started. Structural for the
     * same reason `buildOnly` is: a single-root run in this state carries no
     * `testScope` and keeps `ok: true` (the build passed), so without the
     * stamp `--resume` read it as a COMPLETED zero-suite run — certifying an
     * existing, unrun suite as finished and dropping the re-run advice that
     * is the only path to ever running it.
     */
    endedBeforeTests?: boolean;
    /**
     * What the test phase covered, so the review can state exactly what was and
     * was not run: `workspaces` lists exactly the suites the run executes, and
     * `caveat` — when present — says why that set may be incomplete. Only set
     * for workspace monorepos on a test-running call: a single-package repo's
     * one suite IS its full suite, and a build-only probe runs no tests, so
     * neither may claim a scoping decision it never made.
     */
    testScope?: TestScope;
    /**
     * True when every build and test command exited 0. An install that exits non-zero
     * but leaves a usable tree (a failed `prepare` hook) does NOT set this false — the
     * build below is the authoritative signal, and the `note` explains the install.
     */
    ok: boolean;
    /**
     * Commands killed by the deadline. These are NOT findings: a review must not
     * file "the build timed out" as a defect in someone's pull request.
     */
    timedOut: string[];
    /** Why the run did what it did, in one line — rendered into the agent's report. */
    note: string;
    /**
     * The run this report belongs to: the tree it ran in, and the commit the
     * plan fetched (absent for a local review, whose plan carries no sha).
     *
     * This is what `--resume` verifies, because the report's PATH is not an
     * identity: `--out` is stable per PR across review rounds, `fetch-pr`'s
     * stale-sweep removes only the worktree and branch ref, and the review's
     * own cleanup runs post-review — so a round that dies between the report
     * write and cleanup (the interrupted state `--resume` exists for) leaves a
     * well-shaped report behind for the NEXT round to find. Resuming it would
     * keep the old commit's passing entries on the new round's tree —
     * certifying old-commit passes for the new commit — and skip the install
     * the fresh worktree never had.
     *
     * `plan` is the per-round discriminator every mode has. A LOCAL review
     * recreates nothing the other two clauses can see — its plan carries no
     * sha, and its worktree is the project root, never destroyed — so a stale
     * report from an interrupted local round matched all three and certified
     * pre-edit results for the edited tree. Every round writes its plan afresh
     * (capture-local locally, fetch-pr for a PR), so the plan file's mtime
     * separates rounds in both modes; within one round nothing rewrites it
     * between the fresh call and a resume.
     *
     * `tree` is the part path and sha cannot supply: `fetch-pr` DESTROYS and
     * recreates the worktree every round, at the same path, for the same sha —
     * so a stale report from an interrupted round matches both and is admitted
     * onto a bare tree with no node_modules and no dist, whose every suite then
     * fails with resolution errors framed as candidate PR Criticals. The inode
     * and birth time of the worktree root name the INSTANCE: a recreated
     * directory keeps the path and changes both. No legitimate continuation
     * crosses a recreation — the valid resumes all happen inside one round,
     * on the tree the first call ran in.
     */
    run?: {
        sha?: string;
        root: string;
        tree?: {
            ino: number;
            birth: number;
        };
        /** The plan file's mtimeMs, rounded — the per-round discriminator. */
        plan?: number;
    };
}
/**
 * Did this spawn die on its deadline?
 *
 * Exported so `test-delta`'s rerun asks the SAME question rather than
 * re-deriving it — a copy there used `error.message.includes('ETIMEDOUT')`,
 * which misses an external SIGTERM and fed a silent "base is green".
 */
export declare function spawnTimedOut(r: {
    error?: Error;
    signal?: NodeJS.Signals | null;
    status?: number | null;
}): boolean;
export declare function trimOutput(s: string): string;
/**
 * The environment every build/test/install command runs under.
 *
 * `QWEN_SKIP_PREPARE` is the load-bearing entry, and it is exported and tested so
 * a future edit to this env cannot silently drop it. Without it, `npm ci` builds
 * the whole project through this repo's `prepare` hook — `npm run build` + `npm
 * run bundle` over every workspace, ~190s — which is entirely wasted, because this
 * command does its own *scoped* build right after. `prepare.js` reads this exact
 * flag, and its own comment names this exact case: "Release workflow jobs set this
 * when they run explicit build/bundle steps after npm ci." In a TUI A/B on PR
 * #6866 the install-time full build was the single largest thing left in Agent 7.
 * Harmless on any repo that does not read it.
 */
export declare function buildRunEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/**
 * Exported for the one thing an injected `exec` cannot cover: that the failing
 * set is measured HERE, off the raw text, and survives a trim that drops the
 * FAIL lines it was parsed from.
 */
export declare function run(command: string, cwd: string, timeoutMs: number): CommandResult;
export { unresolvedWorkspaceDeps } from './lib/npm-toolchain.js';
interface BuildTestArgs {
    plan: string;
    worktree: string;
    out?: string;
    timeout: number;
    install: boolean;
    /**
     * Build, then stop — do not run the changed workspaces' tests.
     *
     * For the merge-base tree an A/B probe compares against. Base's tests were
     * green before this PR existed and running them measures nothing about it;
     * what the probe needs from that tree is a compiled `dist/` to run against,
     * and paying for the suite twice is the difference between an A/B a reviewer
     * will use and one they will skip. Defaults false, so the PR-side call is
     * unchanged.
     */
    buildOnly?: boolean;
    /**
     * Whole-call wall-clock budget in seconds. Defaults to what the shell tool's
     * hard 600s ceiling leaves usable (`DEFAULT_WHOLE_CALL_BUDGET_S`), floored at
     * one per-command deadline. Measured from the top of the call — install and
     * build time count against it. The closure's per-command deadlines SUM, and a
     * large one sums past the tool timeout the brief welds onto the call — whose
     * outer kill discards the report. Suites the budget cannot reach are named in
     * `notRun`, and `--resume` continues them in the next call.
     */
    budget?: number;
    /**
     * Continue the run recorded in `--out` instead of starting a new one.
     *
     * The ceiling is per CALL, not per run: one shell invocation cannot exceed
     * 600s, and this repo needs more than that to finish its suites (install 24s
     * + the builds + `packages/core` 106s + `packages/cli` 401s, before four more
     * suites). A resumed call skips install and build — the tree is already
     * installed and compiled by the call being continued — and runs the suites
     * that call could not reach (`testScope.notRun`) plus any it started with a
     * budget-clamped deadline and killed (`clamped`). Results merge into the same
     * report, so every consumer keeps reading one artifact.
     */
    resume?: boolean;
    /**
     * How to run a command. Injectable so the tests can build the states that are
     * hard to force out of real npm — chiefly the one that cost a live review: an
     * install that exits non-zero and leaves a working `node_modules` behind.
     */
    exec?: (command: string, cwd: string, timeoutMs: number) => CommandResult;
}
export declare function runBuildTest(args: BuildTestArgs): BuildTestReport;
export declare const buildTestCommand: CommandModule;
