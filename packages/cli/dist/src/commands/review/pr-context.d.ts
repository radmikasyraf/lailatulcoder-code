/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type Ledger } from './lib/ledger.js';
/**
 * Marker embedded in the "suggestion summary" issue comment that /review used
 * to publish before Suggestion-level findings moved to inline comments.
 *
 * No new summaries are created, but PRs reviewed under the old scheme still
 * carry one. It must keep being recognised so it can be excluded from the
 * "Already discussed" section — otherwise a stale table of suggestions would
 * read as settled discussion and suppress still-open findings.
 */
export declare const SUMMARY_MARKER = "<!-- qwen-review-suggestion-summary -->";
export interface PrMetadata {
    title: string;
    body: string | null;
    author: {
        login: string;
    } | null;
    baseRefName: string;
    headRefName: string;
    headRefOid: string;
    additions: number;
    deletions: number;
    changedFiles: number;
    state: string;
}
export interface RawComment {
    id: number;
    user?: {
        login: string;
    };
    body?: string;
    path?: string;
    line?: number;
    in_reply_to_id?: number;
}
export interface RawReview {
    id: number;
    user?: {
        login: string;
    };
    body?: string;
    state?: string;
    submitted_at?: string;
    /** The head commit the review was submitted against, per the API. */
    commit_id?: string;
}
/**
 * True for a legacy suggestion-summary issue comment, whoever authored it.
 *
 * Authorship is deliberately NOT checked. These summaries were posted by
 * whichever identity ran `/review` — a maintainer locally, or the CI bot in
 * the review workflow — so an author check against the *current* user would
 * miss the ones the other identity left behind, and those would then land in
 * the "Already discussed" section and suppress still-open findings.
 *
 * Matching on the marker alone is also the safer direction: the marker used
 * to promote a comment INTO a trusted rendering section, which is why it was
 * author-gated. It now only excludes a comment, so a third party embedding
 * the marker verbatim merely hides their own text from the review agents —
 * they cannot add it to someone else's comment. Kept pure for unit testing.
 */
export declare function isLegacySuggestionSummary(body: string | undefined): boolean;
/**
 * Repo coordinates for building refetch refs. When provided, emitted refs
 * are copy-runnable commands with real values. The placeholder fallback
 * exists for direct helper calls in tests. Refs are `review comment-body`
 * subcommand invocations, never raw `gh api` routes: the subcommand owns
 * the platform's URL scheme and host routing, so a reader that runs the
 * named command cannot land on github.com's same-named repo by forgetting
 * a GH_HOST prefix the prose used to require.
 */
interface RefContext {
    ownerRepo?: string;
    prNumber?: string;
    host?: string;
}
/** Cap a full review body; the cut names the review id so the tail stays fetchable. */
export declare function fullBody(s: string | undefined, id?: number, ctx?: RefContext): string;
/** Cap a full inline-comment body; the cut names the comment id. */
export declare function fullCommentBody(s: string | undefined, id?: number, ctx?: RefContext): string;
/** Cap a full issue-comment body; the cut names the issue-comment id. */
export declare function fullIssueCommentBody(s: string | undefined, id?: number, ctx?: RefContext): string;
export declare function extractCodeRefs(body: string | undefined): string[];
export declare function carriesBlockerSignal(body: string | undefined): boolean;
/**
 * Walk a comment's `in_reply_to_id` chain up to the root. Defends against
 * cycles (which shouldn't happen on GitHub but cheap to handle).
 *
 * Exported and generic: `comment-status` groups the same flat comment list
 * into the same threads, and a shared walk is what keeps the two surfaces
 * agreeing by construction — a cycle-guard fix applied to one private copy
 * and not the other would silently diverge their thread classification.
 */
export declare function findRootId<T extends {
    id: number;
    in_reply_to_id?: number | null;
}>(startId: number, byId: Map<number, T>): number;
/**
 * The exact "no issues found, LGTM" template the qwen-review pipeline
 * auto-emits, optionally followed by its model footer — and NOTHING else.
 * Anchored to the end of the body on purpose: a legacy malformed review can
 * OPEN with the LGTM line and carry a relocated `**[Critical]**` blocker
 * below it, and a prefix match dropped exactly that body from the context
 * file, letting the re-check approve past the blocker.
 */
export declare const CANONICAL_LGTM_RE: RegExp;
/**
 * Should this review-level summary be shown to agents?
 *
 * Filters out empty bodies (`COMMENTED` reviews submitted alongside inline
 * comments often have body=""), and the canonical "no issues found, LGTM"
 * template the qwen-review pipeline auto-emits — those carry no review
 * content beyond their state, which the agent doesn't need re-told. Only
 * the whole-body template is filtered; any body with more in it is shown.
 */
export declare function isReviewWorthShowing(body: string | undefined): boolean;
export interface InlineThreads {
    openRoots: RawComment[];
    openBlockerRoots: RawComment[];
    repliedBlockerRoots: RawComment[];
    repliedRoots: RawComment[];
    repliesByRoot: Map<number, RawComment[]>;
}
/**
 * The one blocker test, shared by pr-context's re-check section and
 * comment-status's report: semantic blocker prose (humans and attributed
 * posts), plus an attribution-off Critical recognized by its invisible
 * severity marker — gated on the reviewing account, because the marker
 * string is public and plantable, and a planted "critical" marker on an
 * otherwise empty comment would otherwise become a permanent, irrefutable
 * blocker that caps every later round at COMMENT. With `me` empty the
 * marker disjunct never fires: under-promotion loses a re-check, while
 * over-promotion loses approvability, so empty fails toward the former.
 */
export declare function isBlockerBody(body: string | undefined, author: string | undefined, me: string): boolean;
/**
 * Whether any posted ROOT comment carries the invisible CRITICAL marker —
 * exactly the signal authorship unlocks (`isBlockerBody`'s marker disjunct
 * reads root bodies only, and only `critical` promotes). When identity
 * lookup fails while one is present, the context must fail closed instead
 * of proceeding with an empty `me`: an unresolved attribution-off Critical
 * would classify as ordinary discussion and disappear from the blocker set
 * later rounds use, and "could not tell" must not read the same as "was
 * not". Firing on anything WIDER — a reply's marker, a suggestion marker —
 * would fail closed on a signal the identity decides nothing about, and the
 * marker string is public: a planted reply would then convert every
 * transient identity blip into a repeating hard refusal.
 */
export declare function anyRootCarriesCriticalMarker(comments: ReadonlyArray<{
    body?: string | undefined;
    in_reply_to_id?: number | null;
}>): boolean;
/**
 * Group the flat inline-comment list into threads and classify each root.
 * The single copy of this walk: `buildMarkdown` renders from it and the
 * stdout summary counts from it, so the reported count can never diverge
 * from what the file contains.
 */
export declare function classifyInlineThreads(inline: RawComment[], me?: string): InlineThreads;
/** What ledger recovery hands the side-file writer. */
export interface RecoveredLedger {
    ledger: Ledger;
    commitId: string | null;
    /**
     * The winning marker was posted by another account. Recovery adopts the
     * highest-round marker whoever posted it (bounded by
     * `FOREIGN_ROUND_HEADROOM`), so a work list can carry rounds this account
     * never ran — and the convergence diagnosis CITES those round numbers in a
     * body this account posts. Persisted beside the list so the citation can
     * disclose where it came from instead of publishing it bare.
     */
    foreign: boolean;
    /** That foreign winner was merged over this account's own findings. */
    merged: boolean;
    /**
     * The winning review's own id — persisted so Step 6 can find WHICH body's
     * not-reviewed disclosures bind the code-age rule: with several summaries
     * on the PR, "check the previous round's review body" is ambiguous, and
     * checking the wrong one suppresses a finding on code the true previous
     * round declared unread.
     */
    reviewId: number;
}
/**
 * How far past this account's own highest round a FOREIGN marker's round may
 * run and still be adopted. Rounds advance one per posted review, so a
 * legitimate interleave (the CI bot posting while this account idles) sits a
 * handful ahead at most; sixty-four covers any real cadence. Without the
 * bound, round-first selection hands one hostile post a permanent win: a
 * stranger's `round: LEDGER_MAX_ROUND` marker outranks every real round
 * forever, compose's capped stamp pins the counter AT the cap, and every
 * subsequent round re-issues the same ids against different findings — the
 * cross-round id continuity Step 6's rulings key on, destroyed by one
 * comment. Inside the bound an attacker can still win one recovery's round
 * number — round-first selection prefers the higher round — but never the
 * work list: a foreign winner is MERGED over this account's own latest
 * findings (own entries authoritative on id collision), so a displaced or
 * doctored marker cannot retire a certified entry from view, and what
 * survives is re-ruled entry by entry against the code exactly like the
 * foreign inline comments this pipeline already ingests. What the bound
 * removes is the permanent, unrepairable part: the counter can only inflate
 * by a bounded step per hostile post.
 *
 * Under a FAILED identity lookup (null login) every marker is foreign and the
 * base is zero, so recovery is bounded to rounds ≤ the headroom — a real
 * ledger deeper than that declines to recover rather than trust a counter no
 * identity vouches for, and the round is full-range. That is the fallback's
 * price, paid only while the identity endpoint is down.
 */
export declare const FOREIGN_ROUND_HEADROOM = 64;
/**
 * The latest machine ledger posted on this PR — with the trust surface split.
 *
 * The two halves of a marker are not the same claim, and treating them as one
 * cost the mechanism its main use case. The **findings** are a work list: Step
 * 6 owes every entry a fresh ruling against the code at HEAD before repeating
 * or retiring it, so a list from another account is at worst a few claims to
 * re-check — and the same pipeline already ingests other accounts' inline
 * comments as prior-round findings (`comment-status`), which is strictly more
 * trusting than this. The **sha** is different in kind: it scopes the next
 * round's incremental diff, so accepting a foreign one lets an untrusted body
 * decide which lines this pipeline never looks at again. So: the list travels,
 * the anchor does not.
 *
 * Own-account-only was measured shutting the feature off exactly where it was
 * designed to work. The skill's own words are "the file being absent is the
 * NORMAL state everywhere except the machine that ran the last review — CI,
 * another clone, a colleague's checkout", and the marker exists to survive
 * that. But CI posts as a bot and a maintainer runs as themselves, so the
 * accounts differ in the common case: on PRs #9113 and #9094 the CI bot's
 * markers were on the PR and invisible to a local re-run, which then
 * re-reviewed the full diff of an unchanged PR (measured: 119 and 128
 * minutes, ~34M tokens each).
 *
 * Selection is round-first (the counter is the id space and only ever
 * advances), then submitted_at, then the review id, then own-over-foreign —
 * and a foreign round implausibly far past this account's own is not adopted
 * at all (see FOREIGN_ROUND_HEADROOM). Logins compare case-insensitively:
 * GitHub logins are, and a case mismatch would misread an own marker as
 * foreign and strip an anchor this account itself posted. A PENDING review is
 * an unsubmitted draft — the API serves the caller's own drafts in this
 * list — and a draft is not a previous round: a run that crashed between
 * creating and submitting one must not hand the next round a round number,
 * an age reference and a reviewId from state the PR never showed anyone.
 *
 * `commitId` is the winning review's own `commit_id` — the head that round
 * reviewed, set by GitHub, not by the body — the age reference for Step 6's
 * convergence posture. It rides for foreign winners too: it is API
 * provenance about THEIR round, which is exactly what their work list's
 * entries are aged against.
 */
export declare function recoverLedger(reviews: RawReview[], login: string | null): {
    recovered: (RecoveredLedger & {
        foreign: boolean;
        author: string | null;
        /**
         * True when the union fired: a foreign winner was merged OVER this
         * account's own latest findings. The renderer keys its provenance
         * wording on it — a merged list is NOT "another account's claims"
         * (the own subset is this account's own), and its `dropped` sum
         * spans two markers plus the re-cap, so the PARTIAL note must not
         * attribute it to one round's size cap.
         */
        merged: boolean;
    }) | null;
    sawOwnReview: boolean;
};
/** The work-list view of `recoverLedger` — the shape the renderer consumes. */
export declare function latestLedger(reviews: RawReview[], login: string | null): {
    ledger: Ledger;
    foreign: boolean;
    author: string | null;
    merged: boolean;
} | null;
/**
 * The anchor sha the prev-ledger side file HOLDS, read back off disk.
 *
 * Not what this run recovered, and the difference is the point: the persist
 * guard keeps a HIGHER-round side file when the recovery walk comes back
 * short (a concurrent lane, a paginated fetch that returned less than it
 * should, a latest review deleted or edited). Step 1 passes the file's sha,
 * so the file's sha is what the section's verdict must rule on — see
 * `anchorRuling`. Read rather than inferred, because the guard's decision is
 * exactly the thing a caller would get wrong by reasoning about it.
 *
 * Null on an unreadable or shapeless file, which leaves the ruling to the
 * recovered ledger alone — the behaviour before this read existed.
 */
export declare function persistedAnchorSha(sideFilePath: string): string | null;
/**
 * Persist (or degrade) the prev-ledger side file for this run's recovery.
 * Four outcomes, each honest about what this run learned:
 *
 * - Recovered: the ledger's own fields plus `commitId`/`reviewId` — the age
 *   reference and its provenance for Step 6's convergence posture. Readers
 *   of the ledger shape (compose-review's round count, Step 1's
 *   recovered-anchor check) ignore the extra keys.
 * - Not recovered, absence PROVEN (`noOwnReview` — a non-empty reviews list
 *   was walked and no submitted review by this account exists in it; an
 *   empty list may be an error envelope `ghApiAll` flattens to `[]`, and an
 *   own review whose marker fails to parse is a persistent state — neither
 *   proves absence, both strip): the PR demonstrably
 *   holds no prior round for this account — the file is another account's
 *   or a deleted round's leftovers, and it is REMOVED whole: carrying its
 *   round counter would stamp a first review "round N+1" and engage the
 *   posture on rounds this account never ran.
 * - Recovery THREW: unknowable, so the stale file keeps its round counter —
 *   a transient failure must not reset the id space — but loses
 *   `commitId`/`reviewId`: an age reference this run could not re-vouch can
 *   suppress a first-time finding on code changed-and-reverted since the
 *   true previous round (snapshot diffs are not monotonic over intervals),
 *   while dropping it merely fails open to full posting.
 * - Recovered ANONYMOUSLY (`identityKnown` false — the identity lookup threw
 *   or answered empty): with no `me`, every marker walked as FOREIGN,
 *   including this account's own, so the union that protects the certified
 *   work list never had an own side to merge over — and a wholesale write
 *   would let any drive-by marker posted at this round REPLACE this
 *   machine's last known-good list, permanently: the attacker's marker
 *   stays on the PR, so every later outage reopens the swap. When a
 *   readable file exists, an anonymous recovery therefore advances only the
 *   ROUND COUNTER (strictly higher rounds — a stale counter re-issues ids
 *   the PR already carries) and adopts the winner's `reviewId` for future
 *   tiebreaks; the findings stay this machine's own, and `sha`/`commitId`
 *   are dropped — an anonymous round cannot be re-vouched, and an anchor
 *   now superseded by rounds this account never certified must not scope
 *   the next review (the healthy foreign-winner path strips it at the
 *   recovery seam for the same reason). A same-round anonymous winner
 *   changes nothing. With no readable file there is nothing to protect,
 *   and the anonymous recovery is written whole, exactly as before.
 *
 * Every write is write-temp-then-rename: a failure mid-write must leave the
 * previous file intact, never a truncated one that parses as no round and
 * restarts the id space. Best-effort throughout — a side-file hiccup must
 * never fail the command.
 */
export declare function persistRecoveredLedger(sideFilePath: string, recovered: RecoveredLedger | null, flags: {
    noOwnReview: boolean;
    identityKnown: boolean;
}): void;
/**
 * Drop the volume telemetry from a marker another account posted.
 *
 * The same reasoning as the anchor, applied to the other cross-account field:
 * `posted` is the baseline the next round's volume trend is measured against,
 * so a foreign value is not this loop's history — it is a number a stranger
 * chose. And it is a number with leverage in BOTH directions: `posted: 1`
 * makes every following round with any volume read as "not falling", while
 * `posted: 100000` suppresses the signal for as long as the marker stands.
 * Dropped rather than carried-and-disclosed, because unlike the work list
 * there is nothing here for a reader to re-rule on: a volume is a single
 * number with no evidence attached. Absence already reads as "not recorded",
 * which degrades the trend exactly as a pre-telemetry predecessor does. The
 * floor goes with it — it qualifies the volume and nothing else.
 */
export declare const VOLUME_FIELDS: readonly ["posted", "prevPosted", "fresh", "floor"];
/**
 * Drop the whole volume group from a record, whatever shape it is in.
 *
 * ONE list, because there are two seams that must shed it — this one and the
 * anonymous-recovery branch that rewrites the side file by hand — and a
 * hand-kept field list on each is how `floor` came to be shed at one seam
 * and kept at the other, recorded for a round whose volume had been
 * deliberately discarded.
 */
export declare function withoutVolume<T extends Record<string, unknown>>(record: T): T;
/**
 * The volume group PRESENT in a record — the restore half of the same list.
 *
 * The union that protects own findings from a foreign winner has to put the
 * own volume back, and hand-enumerating it there was a third copy of the
 * list `withoutVolume` exists to be the only one of. A field added to the
 * group would otherwise be stripped from the foreign winner and never
 * restored, losing the own data point on exactly the merged rounds the
 * branch protects.
 */
export declare function pickVolume(record: Record<string, unknown>): Record<string, unknown>;
/**
 * Render the previous round's ledger for the context file.
 *
 * `running` is the identity THIS round runs under (`roundModelIdFrom`). The
 * same-model gate is ruled HERE rather than described for the orchestrator to
 * apply, because the two strings are not comparable in prompt text: the
 * marker's `model` is the provider-qualified identity the CLI wrote, while
 * `{{model}}` — the only model value a skill body can interpolate — is
 * `config.getModel()`, the bare id. Told to compare them, an orchestrator
 * either finds them never equal (the recovery path silently never engages,
 * which is this feature's whole payoff lost) or matches them loosely, which
 * accepts another provider's same-named model and re-opens the scope-skip the
 * digest exists to close. So the comparison happens in the process that holds
 * both values, and what reaches the model is a verdict, not two operands.
 *
 * `author` is set only when the marker came from ANOTHER account (the CI bot,
 * typically). The section then says whose claims these are and that no anchor
 * travelled with them, because a reader — human or model — must not read a
 * foreign work list as this account's own certified round. Such a ledger
 * reaches here already stripped of its `sha`, so the gate above never rules
 * on one: a foreign anchor is not withheld by comparison, it is absent.
 * `merged` refines that: when the foreign winner was merged OVER this
 * account's own findings (the union), the list is MIXED — calling it all
 * "THEIR claims" gave false provenance for the own subset and inverted the
 * exact trust distinction the author sentence exists to enforce — and its
 * `dropped` sum spans two markers plus the merge re-cap, so the PARTIAL
 * note must not pin the loss on one round's size cap (a Step 6 reader
 * cross-referencing that round's body finds it complete and dismisses the
 * warning as stale).
 */
export declare function renderLedgerSection(ledger: Ledger, running: string, author?: string | null, merged?: boolean, 
/**
 * The `sha` the prev-ledger side file holds after this run's persist
 * decision — what Step 1 will actually pass. Null when the file holds none
 * or could not be read, which leaves the ruling to this ledger alone.
 */
persistedSha?: string | null): string;
export declare function buildMarkdown(prNumber: string, ownerRepo: string, meta: PrMetadata, inline: RawComment[], issue: RawComment[], reviews: RawReview[], prevLedger?: Ledger | null, me?: string, 
/** Set only when the ledger came from another account — see the section. */
prevLedgerAuthor?: string | null, 
/** True when the ledger is the union of a foreign winner over own findings. */
prevLedgerMerged?: boolean, 
/** The PR host (GitHub Enterprise); baked into the emitted refetch commands. */
host?: string, 
/** See `renderLedgerSection` — the anchor that survives on disk. */
persistedSha?: string | null): string;
/**
 * Headings that begin past `truncateToolOutputThreshold`, which `read_file` will
 * not return on a single read. Reordering buys headroom; it does not create it.
 */
export declare function truncatedHeadings(markdown: string, limit: number): Array<{
    offset: number;
    heading: string;
}>;
export declare const prContextCommand: CommandModule;
export {};
