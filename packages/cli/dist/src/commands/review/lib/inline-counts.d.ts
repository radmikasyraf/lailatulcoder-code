/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** The severity prefixes the skill mandates on every posted inline comment. */
export declare const CRITICAL_PREFIX = "**[Critical]**";
export declare const SUGGESTION_PREFIX = "**[Suggestion]**";
/** A drafted inline comment, as far as counting needs it. */
export interface DraftedComment {
    body?: unknown;
}
/** Leading residue — stripped before classifying and re-stripping. */
export declare const LEADING_INVISIBLE_RE: RegExp;
/**
 * Which severity marker a drafted comment opens with — or null for neither.
 *
 * The ONE statement of the predicate. The counter and the unmarked-scan each
 * restated it at first, and drift between restatements is exactly the
 * bug-class this file's header describes; every caller classifies through
 * here so the two can never disagree about what "marked" means.
 *
 * Classification runs on the same projection the post-time strip matches:
 * leading render-nothing residue is invisible BEFORE the marker on the
 * rendered post, so a gate that classified the raw bytes refused exactly
 * the drafts the strip is written and tested to accept, forcing a pointless
 * re-compose.
 */
export declare function severityOf(c: DraftedComment): 'critical' | 'suggestion' | null;
/**
 * The claim line a marked finding leads with: the severity marker, any
 * colon/whitespace right after it, and every line past the first stripped.
 * Null when the body opens with neither marker — `submit` refuses to post an
 * unmarked finding, so an unmarked body is not a finding and has no claim
 * line to read back.
 *
 * The ONE statement of the readback strip. compose-review's ledger builder
 * and presubmit's carried-id extractor both feed this line to
 * `LEDGER_ID_READBACK`, so the no-marker decision and the slice order can no
 * longer drift between the write side and the read sides — the drift the
 * shared regex removed for the id half (#9212 review).
 *
 * The slice runs on the same projection the classifier admits: leading
 * render-nothing residue is invisible BEFORE the marker on the rendered
 * post, so slicing the raw bytes cut mid-marker; the same residue can sit
 * BETWEEN the marker and the carried id; and the separator admits both
 * colon widths — every shape `severityOf` and `stripSeverityPrefix`
 * accept, and a shape they accept must read back, not garble or null.
 */
export declare function carriedClaimLine(body: string): string | null;
/**
 * The WHOLE body past the severity marker (and any colon/whitespace right
 * after it) — the multi-line form of the readback strip above, and the same
 * ONE statement: `carriedClaimLine` is its first line, and the floor
 * enforcement's moved-record title is its collapsed whole. A second
 * restatement of the marker slice in either consumer is the drift class
 * this file's header exists to prevent. Null when the body opens with
 * neither marker.
 */
export declare function markerStrippedBody(body: string): string | null;
/** How many drafted comments open with each severity marker. */
export declare function countInlineFindings(comments: readonly DraftedComment[]): {
    criticalsInline: number;
    suggestionsInline: number;
};
/**
 * The body with its leading severity markers removed — the shape an
 * attribution-off (`review.attribution: false`) run POSTS, applied by
 * `submit` after the verdict was counted from the marked payload.
 *
 * Iterative: a looping model can draft stacked markers
 * (`**[Critical]** **[Suggestion]** …`), and stripping only the first posts
 * the second — the bare machine marker the mode exists to remove. The
 * classification delegates to `severityOf` so "marked" keeps its ONE
 * statement. A body that is nothing but markers strips to the empty string;
 * `submit`'s consistency gate refuses exactly that shape before the post
 * transform runs, so an empty result never reaches GitHub.
 */
export declare function stripSeverityPrefix(body: string): string;
/**
 * The indices of drafted comments that open with NEITHER severity marker.
 *
 * `countInlineFindings` counts such a comment as nothing at all — which for
 * a verdict computation means a blocker written without its marker weighs zero.
 * Both boundaries refuse these outright instead: `compose-review` because
 * Step 6 is where the draft is still cheap to fix, and `submit` because the
 * skill's own re-compose instruction expects the set to churn after Step 6 —
 * a marker lost in that churn would otherwise reach the one boundary that
 * actually posts, and weigh zero there.
 */
export declare function unmarkedComments(comments: readonly DraftedComment[]): number[];
