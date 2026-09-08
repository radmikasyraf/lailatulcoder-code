/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type DependencyFarm } from './lib/worktree.js';
export interface ScratchTreeReport {
    /** True when a tree stands at `path`, checked out at the commit under review. */
    available: boolean;
    /** Absolute path to this agent's scratch worktree, when one was created. */
    path?: string;
    /** The commit it holds — the review worktree's HEAD, i.e. the PR head. */
    headSha?: string;
    /**
     * True when an earlier call had already created it and this one restored it
     * to `headSha` instead of rebuilding it. Disclosed because it is the answer
     * to "where did my probe file go" — every call hands back a PRISTINE tree.
     */
    reused: boolean;
    /**
     * The `node_modules` farm: how many packages were symlinked in from the
     * review worktree, how many could not be, and whether a farm was already
     * standing. `null` means only one thing: the review worktree has no
     * `node_modules` to link from. A linking FAILURE arrives as
     * `{linked: 0, failed: N}` instead, because `exposeDependencies` guards every
     * fs call it makes and counts what went wrong rather than throwing.
     */
    dependencies: DependencyFarm | null;
    /**
     * Paths the SHARED review worktree carries that its HEAD does not, at the
     * moment of this call. Normally empty. Non-empty means residue is in the tree
     * the other agents are reading right now — most likely this verifier's own,
     * from before it had a scratch tree to work in — and the note says to restore
     * it. This is the cleanliness check the fix is incomplete without: isolation
     * removes the source, and this catches the case where something wrote to the
     * shared tree anyway.
     */
    sharedTreeResidue: string[];
    /**
     * How many dirty paths the tree actually holds. Greater than
     * `sharedTreeResidue.length` means the list above was capped — a capped list
     * read as the complete one is a verifier restoring what it was shown and
     * leaving the rest in the tree the next round reads.
     */
    sharedTreeResidueTotal: number;
    /**
     * Set when the residue check could not run at all. An empty
     * `sharedTreeResidue` means "clean" only while this is absent — a `git status`
     * that died on a tree too dirty for its buffer answers with the same empty
     * list a pristine tree does.
     */
    sharedTreeUnmeasured?: string;
    /** What happened, in one line. Rendered to the verifier verbatim. */
    note: string;
}
export interface ScratchTreeArgs {
    worktree: string;
    label: string;
    out?: string;
}
export declare function runScratchTree(args: ScratchTreeArgs): ScratchTreeReport;
export declare const scratchTreeCommand: CommandModule;
