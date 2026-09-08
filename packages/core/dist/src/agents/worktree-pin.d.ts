/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
/** A validated pin target. `branch` / `slug` are labels, never gates. */
export interface ResolvedWorktreePin {
    path: string;
    branch: string;
    slug: string;
    repoRoot: string;
}
/**
 * Resolve and validate a caller-owned worktree path (e.g. the PR-review
 * worktree `/review`'s `fetch-pr` provisions).
 *
 * Git's worktree registry stops a bad path from aiming the agent somewhere
 * it should not be: the path must be a REGISTERED linked worktree of this
 * repository, enforced by `isRegisteredLinkedWorktree` — git's own registry
 * entry for the path must point back at it, and it must not be the primary
 * working tree. That rejects arbitrary directories, sibling `git init`s,
 * plain sub-directories (including a stale registry record whose directory
 * was recreated), other repositories' worktrees, a directory carrying a
 * copied `.git` file, and the main working tree itself. A registered
 * worktree may live anywhere on disk — the registry entry naming this
 * repository is the boundary, not directory containment.
 *
 * `getRegisteredWorktreeBranch` is consulted only for a best-effort branch
 * label; it is deliberately NOT a gate, since it returns null for a legitimate
 * detached-HEAD worktree.
 *
 * The pin path is resolved ONCE and that single resolution is threaded
 * through the gate and returned as `path`: re-resolving inside the gate —
 * or returning the lexical spelling for the child to bind while the gate saw
 * the canonical one — lets a symlink re-pointed after validation land the
 * child somewhere the gate never checked.
 *
 * @param label how to name the offending parameter in error text — `working_dir`
 *   for the tool, `workingDir` for the workflow opt.
 * @returns the resolved absolute path + labels, or `{ error }` with a
 *   user-facing reason.
 */
export declare function resolveExternalWorktreeDir(config: Config, workingDir: string, label?: string): Promise<ResolvedWorktreePin | {
    error: string;
}>;
