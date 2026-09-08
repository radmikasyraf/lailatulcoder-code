/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Classify a `--out` target BEFORE the command fetches anything: an empty /
 * whitespace-only path, or a path that resolves to an existing directory, is
 * a usage error. A directory target otherwise survives to `writeFileSync`,
 * dies EISDIR there — AFTER the fetches — and exit-codes as a runtime
 * failure instead of the repairable-invocation class the caller keys on.
 */
export declare function assertWritableOutPath(out: string): void;
export declare const REVIEW_TMP_DIR: string;
export declare const REVIEWS_DIR: string;
export declare const REVIEW_CACHE_DIR: string;
/**
 * Filename prefix for review-worktree lease files under `REVIEW_TMP_DIR`.
 * Lives here, not in `review-worktree-lease.ts`, because the review
 * workflow's cleanup sweep deletes leases by glob — the sweep pattern and
 * the lease writer must share one definition (the cleanup spec pins both).
 */
export declare const LEASE_PREFIX = "qwen-review-lease-";
/**
 * Where the skill tees `qwen review parse-args`'s verdict (SKILL Step 0). A fixed,
 * conventional name so a capture command can read back the effort the parser
 * already resolved without the orchestrator threading the `--effort` value through
 * by hand — see `resolveEffort`.
 */
export declare const PARSE_ARGS_REPORT: string;
/** Worktree path for a given PR review session. */
export declare function worktreePath(prNumber: string | number): string;
/**
 * The disposable worktree the test-efficacy probe runs in — a sibling of the
 * shared review worktree, discarded wholesale when the probe finishes (#6832).
 *
 * The one exception to this file's "paths are relative to the project root"
 * rule: this returns an ABSOLUTE path. The probe drives `git worktree add`/
 * `remove` with the shared worktree as cwd, so a relative path would resolve
 * against that worktree, not the repo root, and land the probe tree nested
 * inside the tree it is meant to sit beside. Both call sites — the probe and
 * `cleanup.ts`'s stale-tree sweep — go through here so the `-probe` suffix and
 * this normalisation stay in one place; renaming the suffix in one file used to
 * silently stop the other from sweeping.
 */
export declare function probeWorktreePath(worktree: string): string;
/**
 * The merge-base tree an A/B probe compares against — a second sibling of the
 * review worktree, holding the code as it stood *before* the PR.
 *
 * Absolute for the same reason as `probeWorktreePath`: `git worktree add` runs
 * with the review worktree as cwd, so a relative path would land the base tree
 * nested inside the tree it is meant to sit beside. Kept here beside its sibling
 * so `base-tree` and `cleanup.ts`'s sweep cannot drift apart on the suffix —
 * the failure mode that made the probe tree's helper shared in the first place.
 */
export declare function baseWorktreePath(worktree: string): string;
/**
 * A Step 4 verifier's own throwaway worktree — the tree its probes run in
 * (#9207).
 *
 * The review worktree is READ by concurrent agents for the whole run: the
 * pipelined loop launches round k's verifiers alongside round k+1's reverse
 * auditors, all pinned to that one tree by `working_dir`. A verifier that
 * writes a probe file there, or applies the one-line fix its flip-check needs,
 * is mutating a tree other agents are reading mid-review — measured live, an
 * auditor read a probe's mutant plus a leftover probe test and nearly filed a
 * Critical against residue no commit contains. Restoring afterwards does not
 * close it; the exposure is the window *during* the probe.
 *
 * So each verifier gets its own, and the LABEL is what keeps them apart: shards
 * of one round run concurrently too, and a shared scratch tree would just move
 * the same race one level down (shard B's probe editing the file shard A is
 * measuring). Callers pass their record key, which is already unique per role,
 * round and findings digest.
 *
 * Absolute, and for the same reason as {@link probeWorktreePath}: `git worktree
 * add` runs with the review worktree as cwd, so a relative path would land the
 * scratch tree *inside* the tree it is meant to sit beside — the one place it
 * must never be, since that is the tree it exists to keep clean.
 */
export declare function scratchWorktreePath(worktree: string, label: string): string;
/**
 * The `<worktree>-scratch-` prefix every scratch tree of one review shares, so
 * `cleanup` can sweep a family whose members it cannot name.
 */
export declare function scratchWorktreePrefix(worktree: string): string;
/**
 * A scratch label reduced to one safe path component.
 *
 * The label reaching this is a record key (`verify--round-2--<digest>`), but it
 * arrives over a CLI flag, so it is treated as untrusted: a `../` in it would
 * put the tree — and the `git worktree add` that creates it, and the sweep that
 * later deletes it — somewhere else entirely. Same flattening as
 * {@link safeTarget}, plus a length cap: the suffix rides on a path that is
 * already deep, and a 200-character label is how a `git worktree add` starts
 * failing with ENAMETOOLONG on the platforms with the shortest limits.
 *
 * Exported because the label makes one more journey the path does not:
 * `agent-prompt` writes it into a shell command inside the verifier's brief.
 * Sanitising there with this same function keeps the label shell-inert (no
 * quoting to get right, no metacharacter to reach a shell) AND keeps the brief
 * honest — the flag it shows is exactly the label the tree will be named for.
 *
 * Returns the empty string when nothing survives, and deliberately does NOT
 * substitute a default: `???` and `!!!` are two different labels that flatten
 * to nothing, and a shared default would put two shards in one tree — the race
 * the label exists to prevent, reached through the sanitiser.
 */
export declare function scratchLabel(label: string): string;
/** Local branch ref name for a fetched PR head. */
export declare function reviewBranch(prNumber: string | number): string;
/**
 * Per-target side-file path (review JSON, PR context, presubmit report).
 *
 * Files live under `.qwen/tmp/` rather than the OS temp dir so the path is
 * stable across platforms (macOS's `os.tmpdir()` returns `/var/folders/...`,
 * not `/tmp` — using the project-local dir avoids that mismatch entirely)
 * and so they're scoped to the project rather than the user's whole machine.
 */
export declare function tmpFile(target: string, suffix: string): string;
/** Filename prefix used by `tmpFile`; useful for cleanup globbing. */
export declare function tmpPrefix(target: string): string;
/**
 * A PR-controlled path, flattened for display inside a brief, a prompt, or a
 * terminal line. The brief is the file the agent is told is the whole of its
 * instructions — a git path can legally contain newlines, and a newline inside
 * an interpolated path would let PR content open its own Markdown line there.
 * Functional arguments (the `read_file` path) are JSON-quoted instead, which
 * both survives the newline and remains the parseable single-line form the
 * transcripts checks read.
 *
 * Lives here, not in `agent-prompt.ts`, because residue paths reach two more
 * sinks the same way: `scratch-tree`'s verifier-facing note and the
 * orchestrator's stderr warning. Both render paths that git reports verbatim
 * (the residue probe reads the NUL format precisely so names arrive intact),
 * so both need the same flattening — a control sequence in a filename must not
 * reach a terminal from any of the three.
 */
export declare function inertPath(p: string): string;
