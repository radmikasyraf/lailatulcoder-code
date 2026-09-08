/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { RepoIdentity, ReviewPlatformReader } from './types.js';
/**
 * Parse the clone's origin URL into host + group/project. Handles the URL
 * form (`https://[user@]host/group[/subgroup]/project(.git)`), the scp-like
 * form (`[user@]host:group[/subgroup]/project` — user@ optional for
 * ssh-config/`insteadOf` setups), and nested groups (collapsed to the last
 * two segments, mirroring remote-match). The URL form is tried first so the
 * scheme is never swallowed by the scp branch.
 */
export declare function parseRemoteUrl(url: string): RepoIdentity | null;
/**
 * The two MR facts presubmit's gate compares, from ONE `mr view` fetch:
 * the author's account name (self-PR detection — compared against the
 * gate's whoami account) and the live head SHA (the drift
 * check — under AGit-Flow `sourceBranch` IS the head). A missing author
 * (deleted account) reports '', which fails the comparison soft, like the
 * GitHub path's `author: null`. `username` is server-controlled, so it is
 * type-guarded to a string and trimmed exactly like the gate's whoami
 * account — a non-string reaching `.toLowerCase()` would crash the command
 * outside presubmit's fetch try/catch instead of failing soft.
 */
export declare function mrPresubmitFacts(prNumber: number, ownerRepo: string): {
    author: string;
    headSha: string;
};
export declare const aoneReader: ReviewPlatformReader;
/** One inline finding as it lands on the MR. */
export interface AoneInlineComment {
    path: string;
    /** The new-side line — a multi-line range posts on its END line. */
    line: number;
    body: string;
}
export interface AoneSubmitRequest {
    prNumber: number;
    ownerRepo: string;
    /** The head SHA the review was composed against (GitHub's commit_id). */
    commitId: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    /** The composed summary body. */
    body: string;
    comments: AoneInlineComment[];
}
export interface AoneSubmitResult {
    /** Ids of the inline comments created (only the ones a1 reported). */
    inlineCommentIds: number[];
    /** How many inline comments were created — ids are best-effort. */
    postedInline: number;
    summaryCommentId?: number;
    summaryPosted: boolean;
    /** False only when the event was APPROVE and the approve call failed. */
    approved: boolean;
    approveError?: string;
    /** True when the head moved DURING the posting batch — the pre-write
     *  drift gate is check-then-post, so an amend pushed mid-batch orphans
     *  every inline comment; the post stands but the pins may not. */
    headMovedDuringPost?: boolean;
    webUrl: string;
}
/**
 * A write that FAILED MID-BATCH. The MR already carries part of the
 * review; the structured counts keep submit's report exact, and its
 * do-not-re-run advice keeps a retry from double-posting what landed.
 *
 * `ambiguous` says the FAILED write itself may have reached the server:
 * an exec error cannot tell "refused" from "accepted, then the transport
 * died" — a1 killed by the deadline AFTER the POST committed, a
 * connection reset mid-response, an HTTP 5xx after the server wrote. The
 * comment is then live on the MR while the count says it never landed,
 * and a retry posts it twice. So an ambiguous failure is counted as
 * LANDED for the do-not-re-run advisory — overcounting by one is a
 * cosmetic lie; undercounting is a duplicate post.
 */
export declare class AonePartialPostError extends Error {
    readonly postedInline: number;
    readonly inlineCommentIds: number[];
    readonly summaryPosted: boolean;
    readonly ambiguous: boolean;
    constructor(message: string, postedInline: number, inlineCommentIds: number[], summaryPosted: boolean, ambiguous?: boolean);
}
/**
 * Post a composed review to an Aone MR. The verdict mapping is the
 * design's D6: APPROVE runs the native `mr approve` AFTER the summary
 * lands; COMMENT is the summary alone; REQUEST_CHANGES has NO native
 * equivalent — the summary carries an explicit blocking header, and the
 * unresolved inline Criticals carry the blocking semantics through the
 * discussion merge gate (NEVER the ai_comment gate: a1 cannot mark a
 * comment as AI — see createMrComment).
 *
 * Throws BEFORE writing when the head drifted (the commit_id check
 * GitHub's API performs server-side). Throws AonePartialPostError when
 * a write fails mid-batch; an approve failure alone does NOT throw —
 * the review is fully posted, only the native approval is missing, and
 * the result says so.
 */
export declare function submitAoneReview(req: AoneSubmitRequest): AoneSubmitResult;
