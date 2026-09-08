/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
export type SweepResult = ReturnType<typeof spawnSync>;
/**
 * The first symlink at or above `dir`, or null when every component is real.
 *
 * The walk STOPS at `stopAt` — the checkout — and does not climb through it.
 * Components above the repository are the user's own filesystem layout, not
 * anything a probe can plant: `/var` is a symlink on every macOS box, so a
 * walk to `/` refuses every sweep there while reporting that it found a
 * redirect. What this looks for is a link inside the tree the pipeline owns,
 * which is where a probe can put one.
 */
export declare function redirectedAncestor(dir: string, stopAt?: string): string | null;
/** Git invocations must resolve the tree they are given, not the caller shell's redirects. */
export declare function sanitizedGitEnv(): NodeJS.ProcessEnv;
/**
 * Free a disposable worktree's path: unregister it, then remove what is left.
 *
 * `git worktree remove --force` only clears a tree git still tracks. A directory
 * left at the path after metadata loss or a partial cleanup is reported "not a
 * working tree" and left in place — and a *non-empty* one then makes
 * `git worktree add` fail `already exists`, wedging every later run until
 * someone clears it by hand. So the unregister is followed by a plain remove of
 * whatever dir remains. `rmSync` unlinks a symlink rather than following it, so
 * a tampered leftover cannot redirect the delete outside `tree`.
 *
 * This is `releaseWorktree`'s two-step, and deliberately NOT a call to it:
 * `releaseWorktree` runs git from the process cwd, which need not be this
 * worktree's repo, and it discards the sweep's stderr — which is usually the
 * only thing that explains a subsequent `add` failure. Every caller here needs
 * `cwd` and that stderr.
 *
 * Best-effort by design: a clean path is the normal case, so the unregister does
 * not throw on a non-zero status. `rmSync` still can (`force` suppresses ENOENT
 * but not EPERM/EBUSY) — callers decide what that means.
 */
export declare function discardWorktree(cwd: string, tree: string): SweepResult | undefined;
/** The residue probe's answer: what to name, and how much it left unnamed. */
export interface WorktreeResidue {
    /** The dirty paths, capped — every one of them safe to interpolate. */
    paths: string[];
    /**
     * How many the tree actually holds. `total > paths.length` means the cap bit,
     * and both renderers say so: a capped list presented as the complete one is a
     * verifier restoring twelve paths and leaving the thirteenth in the tree the
     * next round reads.
     */
    total: number;
    /**
     * Why the check could not run, when it could not. An empty list means "clean"
     * ONLY when this is absent: a `git status` that died — ENOBUFS on a tree so
     * dirty its output passed the buffer, a repository git refused to read — used
     * to be indistinguishable from a pristine tree, and the overload case is
     * exactly the one where the answer matters. Both renderers say "could not be
     * measured" instead of "clean" when this is set.
     */
    unmeasured?: string;
}
/**
 * The paths a tree carries that its HEAD commit does not — probe residue, seen
 * from the reading side (#9207).
 *
 * A review worktree is a pristine detached checkout of the PR head, and every
 * build artifact the review produces there is gitignored, so in a healthy run
 * this is empty. What it catches is the one thing that is neither: a file some
 * agent wrote into the shared tree, or a line it edited there, while the
 * pipelined loop had another agent reading the same tree. Named paths, not a
 * boolean — "the tree is dirty" tells a reader nothing it can act on, whereas
 * "these three paths are not in the commit" tells it exactly which of its
 * evidence to distrust.
 *
 * Three flags decide whether the names are usable, and every one of them was
 * wrong in the first cut:
 *
 * - `-z` because the names become COMMANDS. Porcelain's rendered form quotes a
 *   path with spaces or non-ASCII bytes (`"caf\303\251.ts"`) and writes a
 *   rename as `orig -> new`, so a file literally named `a -> b.ts` parsed to
 *   `b.ts"` — a name matching nothing on disk, handed to an agent as the path
 *   to run `git show HEAD:` against. The NUL format is unquoted and puts a
 *   rename's original path in its own record.
 * - `--untracked-files=all` because `normal` collapses a new directory to one
 *   `probe_dir/` entry, and every recovery this pipeline prints — `git show
 *   HEAD:`, `git checkout HEAD --` — fails on a directory. The contamination
 *   shape this exists to catch (an agent dropping probe files into a new
 *   folder) is exactly the shape `normal` renders unactionable. One directory
 *   shape survives the flag: git will not recurse into an untracked directory
 *   that holds its own `.git`, so a cloned fixture still arrives as a single
 *   `dir/` entry — detected and disclosed, but recoverable only by `rm -rf`,
 *   which is what both renderers tell the reader to use for untracked residue.
 * - `maxBuffer` because the default is 1 MB and `spawnSync` answers ENOBUFS by
 *   returning no stdout — which this function would have read as "clean". The
 *   overload case is the one where the tree is dirtiest.
 *
 * Ignored files are excluded, and the pipeline's own build artifacts
 * (`node_modules`, `dist`) are excluded even when the COMMIT under review
 * does not ignore them: the review builds in this tree, and a PR whose
 * `.gitignore` does not cover its install used to turn that install into
 * residue — every verifier's first act aimed at deleting the very tree its
 * farm borrows from.
 *
 * The tree's identity is checked before its state: git's repository discovery
 * walks UP, so a directory whose `.git` file is gone answers `git status`
 * with the enclosing user checkout's dirty state — the wrong tree, measured
 * silently, and the restore recipe this probe triggers aimed at the user's
 * own files. That shape fails closed instead. So does a repository PLANTED at
 * the path — `rm .git && git init && git add -A && git commit` conceals any
 * contamination under a clean status — because no local check can tell a
 * planted repo from the tree it replaced: a genuine review worktree holds its
 * `.git` as a gitFILE naming its admin entry, and anything else is refused as
 * unmeasured rather than certified clean.
 *
 * One blind spot the identity checks cannot close: `git status` never looks
 * INSIDE a committed gitlink (mode 160000), and untracked content there does
 * not dirty it — so a tree carrying submodules is measured for everything
 * except what those paths hold. When a gitlink's directory is non-empty, the
 * answer is unmeasured naming the path, never clean.
 *
 * Empty on any git failure: this is a diagnostic, and a diagnostic that throws
 * would fail the build it is only commenting on.
 *
 * One limit the NUL format does not remove: `encoding: 'utf8'` maps an invalid
 * UTF-8 byte in a filename to U+FFFD, so such a path is reported but no longer
 * resolves on disk. No string form of it can — Node's fs API takes strings here
 * — so the name is disclosed as git rendered it rather than silently dropped.
 */
export declare function worktreeResidue(cwd: string, cap?: number): WorktreeResidue;
/** What a dependency farm run did, and whether it found one already standing. */
export interface DependencyFarm {
    /** Packages symlinked in by THIS call. */
    linked: number;
    /** Packages this call could not link — disclosed, never silently dropped. */
    failed: number;
    /** True when a farm was already in place, so this call had nothing to link. */
    alreadyPresent: boolean;
    /**
     * How many of the linked packages are the repo's OWN workspace members
     * (`node_modules/@scope/pkg` → `../../packages/pkg`). Those links resolve
     * back into the dependency root, so a mutation made in the disposable tree is
     * invisible to any import that goes through the package NAME. Counted so the
     * callers can say so rather than leave it as a property of the layout.
     */
    selfLinked: number;
}
/**
 * Make the dependency root's installed packages resolvable from a disposable
 * tree, by symlinking each `node_modules` entry into it.
 *
 * A fresh `git worktree add` has no `node_modules`, and a per-tree `npm ci`
 * costs minutes that neither the efficacy probe's budget nor a verifier's
 * patience has. So the packages are borrowed rather than installed: the tree
 * holds the CODE under test and reads its dependencies out of the tree that
 * already installed them.
 *
 * The root farm is not the whole job in a monorepo. npm hoists what it can, but
 * a version conflict leaves packages installed under the MEMBER
 * (`packages/cli/node_modules`), and Node resolves those by walking up from the
 * importing file — so a tree with only the root farm fails to resolve exactly
 * the dependency that could not be hoisted. Measured on this repo: a scratch
 * tree with 1 560 root packages linked still could not resolve
 * `@testing-library/react` for a UI probe, because that copy lives under
 * `packages/cli`. Each workspace member's farm is therefore built too, for the
 * members the disposable tree actually contains.
 *
 * Best-effort per entry, and deliberately so: one locked or concurrently
 * unlinked package must not throw out of the run that asked for the farm (for
 * the probe, that would re-class every mutant `inconclusive`). What could not
 * be linked is counted and disclosed by the caller, never silently dropped.
 *
 * **The links are read-write, and they point OUT of the disposable tree.** A
 * probe that writes through one — `writeFileSync(require.resolve('dep/x.js'))`,
 * an `npm rebuild`, a package that writes into its own directory at runtime —
 * lands in the dependency root's copy, which is the shared review worktree, and
 * `node_modules` is gitignored so the residue probe cannot see it. Copying the
 * farm instead would cost the minutes the farm exists to save, so the contract
 * is stated rather than enforced: the tree's own files are yours, its
 * dependencies are borrowed, and a probe that needs to modify a dependency must
 * replace the LINK with a copy rather than write through it. The verifier's
 * brief says the same in the words it acts on.
 *
 * Shared by `test-efficacy`'s `-probe` tree and `scratch-tree`'s per-verifier
 * tree, which is why it sits here rather than in either of them.
 */
export declare function exposeDependencies(probeTree: string, dependencyRoot: string, opts?: {
    rebuild?: boolean;
}): DependencyFarm;
/**
 * The reason a disposable worktree could not be created.
 *
 * The stale-sweep's stderr is folded in because it is usually the explanation:
 * when `add` fails on a leftover the sweep could not clear, the sweep is what
 * says why. Pure, and extracted for that reason — the branch it lives on fires
 * only when `git worktree add` fails, and there is no portable way to force that
 * in a real-git test (the one lever, making `.git/worktrees` unwritable, is
 * bypassed by root and behaves differently under CI's unprivileged user).
 */
export declare function worktreeCreateFailureDetail(label: string, err: unknown, sweepStderr: string): string;
