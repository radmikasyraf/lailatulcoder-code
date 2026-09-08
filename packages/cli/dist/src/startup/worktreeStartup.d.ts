/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@lailatul-coder/lailatul-coder-core';
/**
 * Resolved metadata for a startup worktree. Returned to the caller so the
 * sidecar write (which needs `Config`) can happen after `loadCliConfig`.
 */
export interface StartupWorktreeContext {
    /** Resolved absolute worktree path (where `process.cwd()` now points). */
    worktreePath: string;
    /** Slug, e.g. `my-feature` or `pr-123`. */
    slug: string;
    /** Branch name, e.g. `worktree-my-feature` or `worktree-pr-123`. */
    branch: string;
    /** Repo top level captured before chdir. */
    repoRoot: string;
    /** Branch that was checked out at worktree-creation time. */
    originalBranch: string;
    /** HEAD SHA captured at worktree-creation time (for WorktreeExitDialog). */
    originalHeadCommit: string;
    /** True iff the input was a PR reference. */
    isPullRequest: boolean;
    /**
     * True when the worktree directory already existed at startup and we
     * re-attached to it. PR fetch is skipped
     * on re-attach since the ref was materialized previously, and
     * commit-count semantics in `WorktreeExitDialog` will track only this
     * session's new commits.
     */
    wasReattached: boolean;
}
export type SetupStartupWorktreeResult = {
    ok: true;
    context: StartupWorktreeContext;
} | {
    ok: false;
    error: string;
};
/**
 * Resolves slug, creates the worktree, switches `process.cwd()`, and returns
 * the metadata needed for the post-`loadCliConfig` sidecar write.
 *
 * Returns `null` when `rawInput === undefined` (no `--worktree` flag passed
 * at all). Returns `{ ok: false, error }` for validation / git failures so
 * the caller can print to stderr and exit with a controlled non-zero status.
 *
 * The caller is responsible for chdir-ing back if a later step fails — this
 * helper does not roll back the worktree directory on a downstream error,
 * matching `EnterWorktreeTool`'s "the worktree is yours now" semantics.
 */
export interface SetupStartupWorktreeOptions {
    /**
     * Mirrors `worktree.symlinkDirectories` (Phase D-2). Forwarded to
     * `createUserWorktree` so the new worktree gets the same opt-in
     * symlinks as `enter_worktree` and agent isolation worktrees do.
     */
    symlinkDirectories?: readonly string[];
}
export declare function setupStartupWorktree(rawInput: string | undefined, options?: SetupStartupWorktreeOptions): Promise<SetupStartupWorktreeResult | null>;
/**
 * Result of the post-`loadCliConfig` sidecar persist step. Callers use the
 * boolean fields to decide whether to surface an INFO line in TUI / a
 * `<system-reminder>` in headless / a `pendingWorktreeNotice` in ACP.
 */
export interface PersistStartupWorktreeResult {
    /** True when a pre-existing sidecar was found and overridden. */
    overrodeResumedWorktree: boolean;
    /**
     * Slug of the worktree that was overridden, when {@link overrodeResumedWorktree}
     * is true. Used in the INFO message so users can re-attach to it if they
     * launched with `--worktree` by mistake.
     */
    overriddenSlug?: string;
    /** Path to the sidecar file just written. */
    sidecarPath: string;
}
/**
 * Writes the `WorktreeSession` sidecar that Phase C's `--resume` restore
 * machinery consumes, and tags the worktree directory with the current
 * session ID so cross-session `exit_worktree action="remove"` is refused.
 *
 * Handles the `--worktree` × `--resume` precedence: when a sidecar already
 * exists (the user resumed a session that previously had a different
 * worktree), the new context wins and the previous slug is reported back
 * so callers can show an INFO line.
 */
export declare function persistStartupWorktreeSidecar(config: Config, context: StartupWorktreeContext): Promise<PersistStartupWorktreeResult>;
/**
 * Builds the one-shot context message that gets injected into the model on
 * the first user prompt (TUI: INFO history item + reminder prefix; headless:
 * `<system-reminder>` prefix + JSON event; ACP currently exits before
 * reaching this code path — see the `--worktree` × `--acp` mutex check
 * in `gemini.tsx`).
 *
 * Mirrors `restoreWorktreeContext`'s contextMessage shape so resumed-with-
 * worktree and started-with-worktree sessions read identically to the model.
 *
 * Differentiates the verb based on whether the worktree was just created
 * or the CLI re-attached to a pre-existing one — same slug + branch but
 * meaningfully different user intent. The override addendum (when
 * `--worktree` clobbered a resumed session's prior worktree) is shown
 * regardless of created/reattached state.
 *
 * Parameter type is `Pick<StartupWorktreeContext, …>` rather than the full
 * context so test fixtures can construct minimal literals without
 * tracking every internal field. Adding fields to {@link
 * StartupWorktreeContext} should NOT force test-fixture churn here.
 */
export declare function buildStartupWorktreeNotice(context: Pick<StartupWorktreeContext, 'slug' | 'worktreePath' | 'branch' | 'wasReattached'>, override?: PersistStartupWorktreeResult): string;
