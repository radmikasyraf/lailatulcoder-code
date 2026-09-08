/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type LedgerFinding } from './ledger.js';
/** A file this round and earlier rounds both produced findings in. */
export interface RecurrenceCluster {
    file: string;
    /**
     * Rounds that already reported a finding here, ascending — read off the
     * carried ledger ids (`R<round>-<n>`), which is why they are the rounds the
     * REPORT used rather than a count this module invents.
     */
    priorRounds: number[];
    /** How many of this round's drafted comments land in this file. */
    thisRound: number;
}
/**
 * One of this round's drafted comments, as far as the diagnosis needs it.
 *
 * The carried id is what separates NEW activity from a still-standing finding
 * the round re-posts. Step 6 re-posts every unfixed ledger Critical under its
 * ORIGINAL id, so a single Critical nobody has fixed yet arrives in
 * `drafts` every round: counted as activity it fires both signals forever —
 * a cluster that gains "1 more now" with no new finding ever appearing, and a
 * flat volume trend — which is the steady state, not divergence.
 */
export interface DraftedFinding {
    /** The path this comment anchors to; empty when it has none. */
    file: string;
    /**
     * The ledger id the body carries when it re-posts an earlier round's
     * finding, as the shared readback extracted it. Absent on a fresh finding,
     * which has no id until this round's ledger is built.
     */
    carriedId?: string;
}
/** What the previous round left behind, and how far it can be trusted. */
export interface PrevRound {
    /** Inline comments the previous round posted, when it recorded the number. */
    posted?: number;
    /** Its work list, as the side file recovered it. */
    findings: readonly LedgerFinding[];
    /**
     * Its marker shed findings to fit the ledger's byte budget, so the list is
     * known-incomplete. Measured at up to 35 shed per round on the worst PRs
     * this feature targets — exactly the loops the diagnosis speaks to, so the
     * undercount is disclosed rather than presented as a full count.
     */
    truncated?: boolean;
    /**
     * The marker it came from was not posted by this account. Recovery adopts
     * the highest-round marker whoever posted it, so the round numbers a
     * cluster cites can name rounds this account never ran. Disclosed rather
     * than dropped: the citation is still the best evidence available, and a
     * reader who knows where it came from can check it.
     */
    foreign?: boolean;
    /**
     * The work list is WHOLE — nothing was shed by the marker's byte budget,
     * nothing was refused by the admission test, and it really was recovered.
     * Absence of an id from an incomplete list proves nothing.
     */
    complete?: boolean;
    /**
     * That foreign marker was MERGED over this account's own findings, which
     * survive the union under their own ids. It changes what the disclosure
     * can honestly claim: "may not be this account's own" over a work list
     * that is predominantly this account's own certified entries overstates
     * by exactly the part the union protected.
     */
    merged?: boolean;
    /**
     * The posting floor it ran under, when its marker recorded one. A round
     * that posted under a different floor is not a comparable point on this
     * loop's volume trend — the posture changed, not the loop.
     */
    floor?: 'c' | 'o';
    /**
     * How many of its comments were findings reported for the FIRST time.
     * The number the trend is about — see `fresh` on the diagnosis.
     */
    fresh?: number;
}
export interface ConvergenceDiagnosis {
    /** The round being composed. */
    round: number;
    /** Inline comments this round posts, and the previous round's when known. */
    posted: number;
    prevPosted?: number;
    /**
     * How many of those were reported for the FIRST time, this round and the
     * previous one. The trend runs on these, not on the totals: Step 6
     * re-posts every unfixed ledger Critical under its original id, so the
     * re-post floor only ever rises and a loop whose new findings collapsed
     * from five to one still posts more comments than the round before.
     */
    fresh: number;
    prevFresh?: number;
    /** Files that carried findings before and carry more now. */
    clusters: RecurrenceCluster[];
    /** True when this round's volume did not fall below the previous round's. */
    volumeNotShrinking: boolean;
    /** Carried through from `PrevRound` so the rendering can disclose them. */
    truncatedEvidence: boolean;
    foreignEvidence: boolean;
    mergedEvidence: boolean;
    /**
     * HOW this round's floor resolved to `critical`, or null if it did not.
     *
     * The kind, not a boolean, because the advice quotes it back: `auto` is the
     * default configuration, and wording an auto-resolved floor as an explicit
     * `--severity-floor critical` setting claims a flag nobody passed — beside
     * a floor-enforcement note in the same body that describes it accurately as
     * the RESOLVED floor. Auto also fails open the moment context becomes
     * unavailable, which an unconditional-sounding claim would misstate.
     */
    criticalFloorKind?: CriticalFloorKind;
}
/** How a round's posting floor came to be `critical`. */
export type CriticalFloorKind = 'explicit' | 'auto-resolved';
/**
 * Is this draft a finding reported for the FIRST time?
 *
 * The ONE statement of freshness. Step 6 re-posts every still-standing
 * ledger entry under its ORIGINAL id, so an id minted in an earlier round
 * marks a re-post — the loop holding its position, not the loop generating
 * work. Exported because the marker records the count for the next round's
 * trend, and a second restatement there would let the number the trend reads
 * disagree with the drafts the trend is about.
 *
 * Strict below the round cap. AT the cap the id space collides — consecutive
 * rounds both stamp `R<cap>-*` — so the rule fails toward "carried", because
 * the two errors do not cost the same: calling a re-post fresh narrates
 * divergence at the steady state every round forever, while calling a fresh
 * finding carried costs one round of silence.
 */
export declare function isFreshDraft(d: DraftedFinding, round: number, carried?: ReadonlySet<string>, carriedComplete?: boolean): boolean;
/**
 * The diagnosis for this round, or null when the loop looks healthy.
 *
 * Two signals, either of which fires it, and both are self-comparisons:
 *
 * - **Recurrence.** A file that carried a finding in an earlier round and
 *   carries a NEW one now. Joined by FILE, deterministically — no model
 *   judgement, no similarity scoring. Title similarity was considered and
 *   dropped: the titles are model-written and capped at 80 characters, which
 *   makes them noise at exactly the length where a match would matter. A
 *   cluster that keeps regenerating siblings usually means the fixes are
 *   treating instances of a shared root cause, and that sentence is the whole
 *   value here.
 * - **Volume not shrinking.** From round 3, this round producing at least as
 *   many NEW findings as the previous one. Round 3 because two rounds give
 *   one step and a step is not a trend; "not shrinking" rather than
 *   "growing" because a loop holding steady is not converging either; and
 *   NEW findings rather than the comment total because Step 6 re-posts every
 *   unfixed entry, so the total only ever rises.
 *
 * Both signals read FRESH drafts only. A re-posted still-standing finding is
 * the loop holding its position, not the loop generating work, and counting
 * it as activity fires both signals on the calmest shape there is (see
 * `DraftedFinding`).
 *
 * Returns null — not an empty diagnosis — when neither fires, so a caller
 * cannot accidentally render a section that says nothing. Absent inputs make
 * a signal impossible to evaluate rather than true: a round with no recovered
 * predecessor has no volume to compare against, and one with no previous work
 * list has no recurrence to find.
 */
export declare function diagnoseConvergence(input: {
    round: number;
    posted: number;
    prev: PrevRound;
    /** This round's drafted comments. */
    drafts: readonly DraftedFinding[];
    /**
     * The floor THIS round resolved to, for comparison against the previous —
     * absent when the state named no floor this module recognises. An unknown
     * posture is not a posture that matches, and it is not one that differs:
     * it makes the comparison unavailable, which leaves the trend evaluated as
     * it was before floors were recorded at all.
     */
    floor?: 'c' | 'o';
    criticalFloorKind?: CriticalFloorKind;
}): ConvergenceDiagnosis | null;
/** How many clusters the rendered paragraph names before summarising. */
export declare const MAX_RENDERED_CLUSTERS = 3;
/**
 * The diagnosis as the two sentences a human reads: what was measured, and
 * what that shape usually means.
 *
 * Facts first and separately, because the facts are certain and the reading
 * is not. Where the evidence itself is qualified — a truncated work list, one
 * recovered from another account's marker — the qualification is stated in
 * the same paragraph rather than left for the reader to discover, matching
 * the PARTIAL disclosure `pr-context` already renders for the same data.
 *
 * The recommendations are process-level on purpose — triage the cluster,
 * split it out, stem the posting surface, batch the fixes — and never a
 * code-architecture prescription: this module cannot verify a claim about how
 * the code should be restructured, and an unverifiable claim is exactly what
 * the rest of this pipeline refuses to post.
 */
export declare function renderConvergenceDiagnosis(d: ConvergenceDiagnosis): {
    en: string;
    zh: string;
};
