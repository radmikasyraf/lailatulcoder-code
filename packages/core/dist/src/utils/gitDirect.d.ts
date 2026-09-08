/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Validate a branch/ref name well enough to trust it as a display value — and,
 * defensively, before anything downstream might use it as a path segment. This
 * is a sufficient subset of git's `check-ref-format` rules: it rejects empty
 * names, leading/trailing slashes, leading/trailing dots, `..` (path
 * traversal), `@{`, `.lock` suffixes, and the control/space/special characters
 * git itself forbids.
 */
export declare function isValidRefName(name: string): boolean;
/** A SHA-1 (40 hex) or SHA-256 (64 hex) object id. */
export declare function isValidGitSha(value: string): boolean;
/**
 * Clear all cached gitDir state (e.g. after a repo is created/removed). Both
 * the resolution cache and the shared reflog watchers are gitDir-keyed, so this
 * also tears the watchers down — clearing only half would leak their fds.
 */
export declare function clearGitDirCache(): void;
/** Parsed HEAD: a branch name, or a detached commit (full object id). */
export interface GitHead {
    type: 'branch' | 'detached';
    /** Branch name when `type === 'branch'`, otherwise the full commit sha. */
    name: string;
}
/**
 * Read and parse `<gitDir>/HEAD` directly. Returns null when HEAD is missing,
 * unreadable, or unrecognized.
 *
 * The branch name is taken verbatim from the `ref: refs/heads/<branch>` line,
 * so packed-refs never need to be consulted. A detached HEAD holds the raw
 * object id, which is returned as-is (callers shorten it for display).
 */
export declare function readGitHead(gitDir: string): Promise<GitHead | null>;
/**
 * Resolve a display string for the current branch of `cwd`: the branch name,
 * or a short commit hash when detached. Returns undefined when `cwd` is not in
 * a git repository or HEAD can't be read.
 */
export declare function resolveBranchName(cwd: string): Promise<string | undefined>;
/**
 * Subscribe to branch changes for `cwd`'s repository.
 *
 * Multiple subscribers on the same git dir share one `fs.watch` on
 * `<gitDir>/logs/HEAD` (the reflog, which moves on branch switch / commit /
 * reset). The returned disposer removes this subscriber and tears the watch
 * down once the last subscriber leaves. If the repo can't be resolved or has
 * no reflog yet, the disposer is a harmless no-op.
 */
export declare function watchRepoBranch(cwd: string, onChange: () => void): Promise<() => void>;
