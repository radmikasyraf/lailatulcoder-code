/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Walk up from `startDir` looking for the nearest ancestor that contains a
 * `.git` entry, and return that ancestor's path. Returns `null` if no
 * ancestor up to the filesystem root has `.git`.
 *
 * `.git` is a directory in a normal clone but a regular file (containing
 * `gitdir: <path>`) in git worktrees and submodules. Both shapes mark a
 * repo root — this helper accepts either, so callers don't silently break
 * for worktree / submodule users.
 *
 * Symlinks are intentionally not chased: `lstat` reports them as
 * `isSymbolicLink()`, which is neither a directory nor a regular file, so
 * the walk continues past them. That preserves the behavior the previous
 * private copies in `memoryDiscovery.ts` and `memoryImportProcessor.ts`
 * had.
 */
export declare function findProjectRoot(startDir: string): Promise<string | null>;
