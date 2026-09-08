/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { parseDiff } from './diff-plan.js';
/**
 * The PR's own hunks that overlap what changed since the anchor.
 *
 * `fullBytes` is `base..head` — exactly what GitHub renders. `deltaBytes` is
 * `anchor..head`, read for its post-image ranges and nothing else: not one of
 * its bytes reaches the result.
 *
 * Returns null when there is nothing to narrow to — the caller keeps the full
 * range, which is always safe because it is the review the round would have
 * done anyway. Null covers, deliberately treated alike: a capture on EITHER
 * side that did not decode, a delta carrying a path the full capture does not
 * carry at all — the canonical "undo per feedback" round lands here when the
 * undone file no longer appears in `base..head` — and a rename the full
 * capture keys differently (git's rename detection resolved differently
 * across the two ranges, so the change would drop from the scope under the
 * key mismatch). A delta whose ranges miss the full capture's hunks does NOT
 * land here: a missed hunk might be a netted-out undo, but it might equally
 * be a change the two captures position disjointly, so the join fails closed
 * for it — the section is emitted whole, never dropped.
 */
export declare function narrowToDelta(fullBytes: Buffer, deltaBytes: Buffer): Buffer | null;
/** A parsed section of the full capture, as `parseDiff` reads it. */
type FullSection = ReturnType<typeof parseDiff>['files'][number];
/**
 * What the narrowing decided, before it assembles anything.
 *
 * Exposed because the scope is not always exactly what the delta touched: the
 * one-hop widening adds still-clean files that import a touched one, and it
 * needs the same guards to have passed and the same sections to assemble out
 * of. Keeping one selection means the widening cannot re-derive a set the
 * refusals above already ruled out.
 */
export interface NarrowSelection {
    /** The full capture's sections, in the order it rendered them. */
    readonly sections: readonly FullSection[];
    /** The full capture, decoded — the text every emitted line comes from. */
    readonly fullText: string;
    /** Paths the delta touched. Every one is carried by the full capture. */
    readonly touched: ReadonlySet<string>;
}
/** The guard-and-select half of `narrowToDelta`. Null for the same reasons. */
export declare function selectNarrowing(fullBytes: Buffer, deltaBytes: Buffer): NarrowSelection | null;
/**
 * The named sections of the full capture, in the capture's own order.
 *
 * Null when `paths` selects nothing — the same "nothing to narrow to" the
 * caller turns into a full-range round.
 */
export declare function assembleSections(selection: NarrowSelection, paths: ReadonlySet<string>): Buffer | null;
export {};
