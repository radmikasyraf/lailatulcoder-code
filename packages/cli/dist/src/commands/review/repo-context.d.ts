/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type Stats } from 'node:fs';
import { type RepositoryContextProvider } from './lib/repository-context.js';
interface RepoContextArgs {
    plan: string;
    worktree: string;
    out: string;
}
export declare const REPOSITORY_CONTEXT_PROVIDERS: readonly RepositoryContextProvider[];
export declare function runRepoContext(args: RepoContextArgs, providers?: readonly RepositoryContextProvider[]): void;
/**
 * Commit the enriched plan without ever exposing an advanced run epoch.
 *
 * The plain write-then-restore pair had two windows, both found by audit.
 * (R2-11) the atomic rename commits the temp file's FRESH mtime, and the
 * separate `utimesSync` restore lands a syscall later — a kill between the
 * two leaves the plan enriched with an advanced epoch, and the
 * skip-when-identical guard above then makes the damage permanent: a retry
 * sees identical bytes, never rewrites, and nothing ever restores the
 * epoch. So the TEMP file is stamped with the anchor's times BEFORE the
 * rename: at every instant the plan path exists, it carries the epoch this
 * run's evidence is fenced on. (R8-49) the compare-and-refuse upstream ran
 * a full read+compare+write before its rename, and a concurrent capture
 * landing in that window was silently overwritten with stale contents
 * under the OTHER run's epoch — so identity is re-checked against the
 * anchor immediately before the rename, leaving only the two adjacent
 * syscalls no userspace sequence can close.
 *
 * Exported for its probes.
 */
export declare function commitPlanPreservingEpoch(planPath: string, serialized: string, anchor: Stats): void;
export declare const repoContextCommand: CommandModule;
export {};
