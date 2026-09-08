/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Returns true when `path` is git-ignored under the worktree at `worktree`.
 * Uses `git check-ignore` (exit 0 = ignored, 1 = not). Any other outcome
 * (git missing, not a worktree, fatal error, kill on the deadline) is
 * treated as not-ignored so a guard never passes on a false signal.
 *
 * Probe a representative FILE, not the directory: a directory-form
 * re-include negation only applies to paths git knows are directories, so
 * probing the directory can spuriously report ignored. The path need not
 * exist — check-ignore evaluates the ignore rules against the pathname.
 *
 * `timeoutMs` bounds the spawn. The 5 s default suits a guard probing its
 * own repository; a caller probing a worktree it does not control passes
 * the generous deadline its other git calls run under — a kill reads as
 * "not ignored", which would accuse a correct Test Plan.
 */
export declare function isGitIgnored(worktree: string, path: string, timeoutMs?: number): boolean;
