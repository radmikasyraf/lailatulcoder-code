/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { NarrowSelection } from './narrow-diff.js';
/** A still-clean file pulled in because it imports a changed one. */
export interface InteractionFile {
    path: string;
    importsChanged: string[];
}
export interface IncrementalScope {
    /** The anchor this scope was computed against, full sha. */
    anchor: string;
    /** Touched since the anchor, and carrying a section of the PR's own diff. */
    deltaFiles: string[];
    /** Still-clean files the widening pulled in, with the edges that did it. */
    interaction: InteractionFile[];
    /** Clean source files the widening considered and did NOT pull in. */
    contextFileCount: number;
}
export interface WidenedScope {
    /** Every path to publish: what the delta touched, plus what imports it. */
    paths: Set<string>;
    /** The record the plan carries and the chunk briefs read. */
    scope: IncrementalScope;
}
export interface WidenInput {
    /** Full sha of the anchor, for the report. */
    anchor: string;
    /** What `selectNarrowing` decided — its guards have already passed. */
    selection: NarrowSelection;
    /** Read a repo-relative file from the worktree; null when unreadable. */
    readWorktree: (repoRelPath: string) => string | null;
}
/**
 * Widen a narrowing by one import hop.
 *
 * This never declines and never narrows: with nothing to pull in it returns
 * exactly the paths the narrowing selected, so the unwidened round is the
 * floor rather than a separate path that could disagree with it.
 */
export declare function widenScope(input: WidenInput): WidenedScope;
