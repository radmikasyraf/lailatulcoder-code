/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type Severity, type Source } from '../../utils/findings.js';
import { type Ledger } from './lib/ledger.js';
import { type CriticalFloorKind } from './lib/convergence.js';
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
/**
 * The floor above which a zero-finding Approve is disclosed as low-signal,
 * in the plan's `srcDiffLines` — diff lines belonging to `source` files, the
 * same field the review topology is chosen from (tests, docs and generated
 * files excluded by construction). A trivial edit stays under it even
 * scattered one changed line per hunk (~8 diff lines each with context and
 * hunk header, plus 4 file-header lines), and the smallest diff the topology
 * gate calls big is 500 — so the floor sits well past the typo-fix class and
 * well before "big".
 */
export declare const LOW_SIGNAL_SRC_DIFF_LINES = 100;
/**
 * A deferred finding, TYPED. The convergence posture removes findings from
 * posting through exactly one channel, and for four review rounds that
 * channel was free text re-parsed for provenance it did not carry: a
 * separator regex classified deterministic source, a marker regex caught
 * mis-routed Criticals, and every round's probe found the spelling each
 * regex excluded — kebab paths, the SKILL's own aggregate suffix, an en
 * dash, `(Critical)`, a title-borne `[test]`. The class closes only by
 * carrying the fields: the model already holds `file`/`line`/`source`/
 * `severity`/`title` for every finding in the artifact it wrote in Step 6,
 * so the entry carries them, `deterministic` derives from `source`, the
 * relocation from `severity`, and the rendered `file:line — [source] title`
 * is formatting — nothing downstream ever parses it back.
 *
 * Validated at the boundary like every other model-written state field:
 * a present entry of the wrong shape is refused (a NaN count is refused
 * the same way), because a channel that un-posts findings must not be
 * guessed at.
 */
export interface DeferredEntry {
    file: string;
    line?: number;
    /** The finding's source tag — decides deterministic (`build`/`test`/`probe`). */
    source: Source;
    /**
     * The finding's severity. Only `Suggestion` defers; a `Critical` here is
     * RELOCATED into the body Criticals (a Critical is never deferred), and a
     * `Nice to have` is refused (terminal-only, never publishable).
     */
    severity: Severity;
    /** One-line claim, rendered inside a code span; a location count may be appended. */
    title: string;
    /** For a pattern aggregate: how many further locations the finding covers. */
    locations?: number;
}
/** Render one entry as the human line — formatting only, never re-parsed. */
export declare function renderDeferredEntry(entry: DeferredEntry): string;
/**
 * The ONE statement of the floor normalisation, shared by the enforcement
 * gate below and `composeReviewBody`'s licence block. Both run over the same
 * `severityFloor` in a single compose call, feeding two decisions that must
 * agree (enforcement fires only where the deferral licence holds) — two
 * restatements is the predicate-drift class `lib/inline-counts.ts`'s header
 * exists to prevent.
 */
export declare function normalizeSeverityFloor(value: unknown): string | undefined;
/**
 * Does the posting floor resolve to `critical` for the round being composed?
 *
 * The ONE statement of that rule. `floorEnforcedReroute` ACTS on it, moving
 * otherwise-postable Suggestions into the deferral channel; the convergence
 * rendering READS it so its handling advice never recommends a posture the
 * round is already running under — a paragraph telling the author to drop to
 * `--severity-floor critical` inside the very body whose floor-enforcement
 * note says Suggestions were already moved past that floor.
 */
export declare function criticalFloorKind(severityFloor: unknown, contextUnavailable: boolean, prevRound: number): CriticalFloorKind | undefined;
/**
 * Whether the floor resolves to `critical` for ENFORCEMENT — strict, so a
 * posture the state never named cannot move a finding out of the posting
 * set. `floorEnforcedReroute` acts on this; the reporting reading above is
 * what the round says about itself.
 */
export declare function criticalFloorInEffect(severityFloor: unknown, contextUnavailable: boolean, prevRound: number): boolean;
/**
 * The posting floor, enforced in code — the backstop for the posture SKILL
 * Step 6 resolves in prose.
 *
 * Step 6 tells the MODEL to route otherwise-postable Suggestions into the
 * deferral channel once the floor resolves to `critical` (an explicit
 * `--severity-floor critical`, or `auto` from round 6). A model instruction
 * is the layer of this pipeline that has failed at every boundary it
 * guarded (this file's own header history), and the floor is the OPERATOR'S
 * configured policy — moving a drafted Suggestion out of the inline set is
 * faithful execution of that policy, not a tool decision. So the move also
 * exists as code, here, where the drafts are already in hand.
 *
 * Enforcement fires ONLY where the deferral licence already holds: an
 * explicit `critical` floor at any round, or `auto` at round ≥ 6 with the
 * round knowable. Everything else fails OPEN exactly as the posture itself
 * does — an unrecognisable floor, `auto` before round 6, `auto` in the
 * context-unavailable state (the round is unknowable), `--severity-floor
 * suggestion` (posture off): a posting bar in doubt posts. The rounds-2–5
 * code-age rule stays model-side on purpose — it needs the worktree git
 * checks this module does not have.
 *
 * The entries are CONSTRUCTED typed rather than routed through
 * `toDeferredEntries`: that boundary validates a MODEL-written channel and
 * throws on malformed shapes, and a throw here would lose the whole round
 * over a comment this code itself chose to move (the cap-not-refusal
 * doctrine). A drafted comment that cannot yield a usable entry — no
 * path — is left inline instead (fail open; `submit`'s consistency gate
 * refuses pathless comments before anything posts anyway).
 */
export declare function floorEnforcedReroute(severityFloor: unknown, contextUnavailable: boolean, prevRound: number, drafted: ReadonlyArray<{
    path?: unknown;
    line?: unknown;
    body?: unknown;
}>): {
    indices: number[];
    entries: DeferredEntry[];
};
/**
 * Reads a PR's description body, given its `owner/repo` and number. The one
 * production implementation calls `gh pr view`; the bilingual fallback uses it
 * to recover the Han signal from the live PR when the plan does not carry it.
 */
export type PrBodyFetcher = (ownerRepo: string, prNumber: string) => string;
export interface ComposeReviewInput {
    /**
     * Critical findings anchored as inline `comments` entries.
     *
     * A seam for the two CLI boundaries and the tests — NEVER a field of the
     * model-written state JSON. Both boundaries derive it from the drafted
     * comments (`compose-review --comments`, `submit`'s payload) and refuse it
     * when the JSON carries it: a count handed over beside the thing it counts
     * is a count that can disagree with it, and a dogfooded report-only run —
     * where nothing downstream recounts — moved its one Critical from
     * `bodyCriticals` to an inline comment, lost the count on the way, and this
     * function printed `Verdict: Approve` over a Critical the report listed.
     */
    criticalsInline?: number;
    /** Suggestion findings anchored inline. Same seam, same refusal. */
    suggestionsInline?: number;
    /**
     * Critical descriptions whose only copy lives in the review body — the
     * last-resort unmappable findings and 422-relocated ones. They count
     * toward `C` exactly like anchored Criticals.
     */
    bodyCriticals?: string[];
    /**
     * Suggestions discarded as unanchorable (offline validation or 422). A
     * count, as the Step 7 prose prescribes; the list form that older skill
     * revisions wrote — `[]`, or one entry per discarded item — is accepted
     * and counted by its length.
     */
    suggestionsDiscarded?: number | readonly unknown[];
    /**
     * Suggestions this review confirmed but did not re-post because they are
     * already reported on the PR (a prior round, or a concurrent reviewer) —
     * one entry each, naming the finding and where it already lives, e.g.
     * `R1-1 precheck-pr pin — already reported (comment 3788857375)`. Distinct
     * from `suggestionsDiscarded`: these anchored fine, and rendering them
     * under the anchor-failure sentence posts a claim the resolver's output
     * contradicts. They still count toward `S` — a run must not read as
     * zero-finding because its findings were duplicates.
     */
    suggestionsDroppedAsDuplicates?: string[];
    /**
     * The findings the convergence posture deferred — Step 6's round-aware
     * posting discipline (from round 6, or under an explicit `--severity-floor
     * critical`, and the rounds-2-5 code-age rule). TYPED entries — see
     * `DeferredEntry`: only otherwise-postable high-confidence Suggestions
     * belong here (a `Critical` is relocated into the body Criticals, a
     * `Nice to have` is refused; low-confidence findings stay terminal-only and
     * never enter the state). They are neither drafted inline nor counted
     * toward `S` — a deferral must not regenerate a review round — but they
     * must not vanish either: the body renders them as a disclosed,
     * NON-capping list, so the record survives on the PR while the round
     * stays convergent. A deferral never withholds the ledger anchor: it is a
     * posting decision, not unreviewed scope.
     */
    deferredSuggestions?: DeferredEntry[];
    /**
     * The UNRESOLVED posting floor from the Step 1 verdict (`critical`,
     * `suggestion`, or the literal `auto`) — never the level `auto` resolved
     * to this round: the module resolves `auto` itself from the side-file
     * round, and a pre-resolved `suggestion` is indistinguishable from the
     * operator's posture-off override (a shipped regression, closed in round
     * 5). Carried so the deferral channel's precondition is checkable:
     * deferrals are legitimate under a
     * `critical` floor at any round, and under `auto` from round 2 (the
     * code-age rule) — never under an explicit `suggestion` floor (the
     * operator turned the posture off), never on round 1 of `auto` (no
     * posture, no age reference), never under `auto` in the
     * context-unavailable state (the round is unknowable), and never ABSENT
     * beside a non-empty deferral list: the field ships in the same PR as the
     * channel, so omission is fail-closed — a dropped echo must not silently
     * re-license what an explicit `suggestion` floor forbade. Unlicensed
     * shapes cap; they never throw.
     */
    severityFloor?: 'critical' | 'suggestion' | 'auto';
    /**
     * Existing Criticals already on the PR whose Step 6 re-check landed on
     * `cannot tell` — one line each (location + what could not be decided).
     * Not counted in `C` (the review did not confirm them), but their
     * presence forbids an approval.
     */
    cannotTellCriticals?: string[];
    /** Uncoverable chunks, e.g. `"chunk 5 (src/big.min.js)"`. */
    uncoverableChunks?: string[];
    /**
     * Dimensions nobody reviewed. A bare name (`"security"`) means its agent
     * whiffed twice and gets the standard explanation; an entry carrying its
     * own reason after an em-dash (`"issue-fidelity — linked issue #123 could
     * not be fetched"`) is rendered verbatim.
     */
    unreviewedDimensions?: string[];
    /**
     * The plan report from Step 1.
     *
     * Coverage is derived from it plus the harness's transcripts — it is not an
     * input. See the recomputation below for why a caller does not get to say
     * whether the diff was read.
     */
    planPath?: string;
    /**
     * The cumulative reverse-audit findings file at loop end — the same file
     * every round's `agent-prompt --findings` received, after the final merge.
     * compose-review reads it itself for the one fact Step 6's confirmed-only
     * read is otherwise a model's word on: whether any entry still carries the
     * `— [unverified]` tag. A surviving tag means no verifier ever ruled on
     * that entry, and the verdict is capped whether or not the report excluded
     * it. A path that does not read fails closed — "could not show" and "was
     * not" read the same to the person the verdict posts at. Omitted, the
     * check is off: every non-high review, which runs no Step 5.
     */
    findingsPath?: string;
    /**
     * Where to look for the harness's records. Defaults to the environment the CLI
     * exported. A test seam only — production never passes it, and a model cannot:
     * `compose-review` reads its input as JSON, and this is not serialisable into
     * anything that would change where the transcripts are found on a real run.
     */
    env?: NodeJS.ProcessEnv;
    /**
     * How the bilingual fallback reads the live PR body when the plan carries a
     * PR identity but no `prDescriptionHasHan` (a `plan-diff` plan, or one an
     * improvising orchestrator wired in place of `fetch-pr`'s report). A test
     * seam ONLY: production leaves it undefined and the CLI reads the PR with
     * `gh pr view`. The handler **strips it from the input JSON** before use (the
     * same way it strips `env`), so a model cannot supply one — not even a
     * non-function value that would throw past the default and drop the fold. It
     * can neither force nor suppress the Chinese fold, which is the whole point of
     * keeping the signal the CLI's own.
     */
    prBodyFetcher?: PrBodyFetcher;
    /** Step 1's lightweight `pr-context` fetch failed. */
    contextUnavailable?: boolean;
    presubmit?: {
        downgradeApprove?: boolean;
        downgradeRequestChanges?: boolean;
        downgradeReasons?: string[];
    };
    /**
     * The drafted inline comments this review is posting — the ledger's own
     * input. A seam like `criticalsInline`, filled by the two CLI boundaries
     * from the same array they count, never by the model's state JSON (the
     * handler strips it, as it does `env` and `prBodyFetcher`).
     */
    draftedComments?: Array<{
        path?: unknown;
        line?: unknown;
        body?: unknown;
    }>;
    /**
     * Model id for the footer, e.g. `qwen3.7-max`. The marker's anchor takes
     * the session-published identity instead when the CLI boundary injects one
     * (`composeReview`'s `runtimeModelId`); this field is its fallback for runs
     * no session published, and what the visible footer names either way.
     */
    modelId: string;
}
export interface ComposeReviewResult {
    event: ReviewEvent;
    body: string;
    /** The table row before caps and downgrades — for the terminal report. */
    baseEvent: ReviewEvent;
    /** Which cap states applied (empty when none). */
    cappedBy: string[];
    /** True when a presubmit flag actually changed the event. */
    downgraded: boolean;
    /**
     * What the presubmit downgrade moved the event *from*, when it moved one.
     *
     * `baseEvent` cannot answer this: it is the row before caps AND downgrades, so a
     * `REQUEST_CHANGES` that a cap already softened to `COMMENT` before the downgrade
     * ran would look the same as one the downgrade itself moved. This names the
     * transition the downgrade made, so the terminal verdict can say a Request
     * changes — a review with confirmed Criticals — was downgraded, and not let it
     * read as "Comment, nothing blocking".
     */
    downgradedFrom: 'Approve' | 'Request changes' | null;
    /**
     * The orchestrator-facing fix for each coverage/verification gap the body
     * discloses — printed to stderr by the command, never rendered into the body.
     * The body tells the PR author what the review cannot certify; this tells the
     * operator which command repairs it. Two registers, two channels.
     */
    remediation: string[];
    /**
     * How many non-Critical findings the convergence posture deferred — the
     * count of `deferredSuggestions` entries that survived validation, plus
     * any CLI floor-enforced reroutes (below). On the verdict surface so
     * `verdictLine` can say a deferrals-only Approve deferred findings
     * rather than implying none existed: the low-signal sentence's premise
     * is "zero findings", and a deferral is a finding.
     */
    deferredCount: number;
    /**
     * Indices (into the caller's drafted-comments array) of Suggestion
     * comments the CLI moved into the deferral list under a resolved
     * `critical` posting floor — SKILL Step 6's posture, enforced in code as
     * the backstop for the model-side resolution (`floorEnforcedReroute`).
     * The caller that owns the posting array (`submit`) removes exactly
     * these before the write; they are already counted in `deferredCount`,
     * rendered in the body's deferral list with a disclosure sentence, and
     * excluded from the ledger work list — the same semantics as a
     * model-side deferral. Empty when nothing was enforced. A posting
     * decision, never a cap: `cappedBy` is untouched and the anchor rides
     * iff the round is otherwise clean.
     */
    floorEnforced: number[];
    /**
     * How many inline comments this round will post — the posting set after
     * floor enforcement, i.e. what `submit` sends. Convergence telemetry: it
     * rides the ledger marker for the next round to read, and the terminal
     * report states it so the operator sees this round's contribution to the
     * PR's comment volume without counting threads by hand. Decides nothing.
     */
    postedInline: number;
    /**
     * How many of `postedInline` this round reported for the FIRST time —
     * neither a re-post of a still-standing ledger entry nor an unmarked
     * draft. The number the convergence trend runs on, stamped into the marker
     * beside the total so the next round can compare like with like.
     */
    postedFresh: number;
    /**
     * The convergence paragraph, when a signal fired — the SAME text the body
     * carries, returned so a terminal copy exists.
     *
     * The overflow ladder sheds this paragraph first, and its notice tells the
     * author the trimmed sections "still hold — read them in the terminal
     * report". That was a false record while this text lived only inside the
     * body composer: unlike the deferral list (findings artifact) and the
     * not-reviewed disclosures (the model's own inputs), a diagnosis derived
     * from the side file has no other copy anywhere.
     */
    convergence?: {
        en: string;
        zh: string;
    };
    /**
     * The previous round's `postedInline`, recovered from the side file when
     * it recorded one. Absent on round 1, on a recovery miss, and on any
     * predecessor that predates the field — none of which is "posted
     * nothing", which is why absence is distinct from zero here.
     */
    prevPostedInline?: number;
    /**
     * What the body budget had to give up to fit GitHub's limit, when it did.
     * On the result because `verdictLine` — printed to stderr, persisted in
     * the composed JSON, copied into the archived report — otherwise keeps
     * claiming the deferral list is "listed in the body" over a body that
     * lists none: the stronger form of the false record this module already
     * refuses for the line cap.
     */
    bodyTrim: {
        /** Disclosure sections dropped whole, counted in the body. */
        sections: number;
        /** The deferral display was one of them. */
        deferralList: boolean;
        /**
         * The bilingual fold was dropped — the first rung, and the only one that
         * costs no content: the English above it says the same thing.
         */
        fold: boolean;
        /** The un-trimmable remainder still overflowed and was cut. */
        truncated: boolean;
    };
    /**
     * Set on an APPROVE composed from zero findings over a non-trivial source
     * diff (the plan's `srcDiffLines` above `LOW_SIGNAL_SRC_DIFF_LINES`).
     * Disclosure only — the event never moves on it: the coverage gate proves
     * the agents READ the diff, not that the review had discriminating power,
     * and a dogfooded weak-model run drafted nothing from its whole roster on a
     * diff where stronger same-condition runs found a verified blocker, then
     * printed a bare confident Approve. The verdict line names the shape.
     * `agents` is the plan's required roster — all on record at APPROVE, or
     * coverage would have capped — and `srcDiffLines` the plan's own count.
     */
    lowSignal: {
        agents: number;
        srcDiffLines: number;
    } | null;
    /**
     * True when the machine-derived coverage evidence leaves doubt that the
     * whole diff was READ — a chunk with no receipt, an uncoverable chunk, an
     * idle/blind/never-opened agent, unreadable transcripts, a context fetch
     * that failed. Deliberately narrower than `cappedBy`: it says nothing about
     * how DEEPLY the diff was reviewed, only about whether it was reached.
     *
     * The incremental anchor is the one consumer (`ledgerMarkerFor`). Emitted in
     * the composed artifact too, because "why did this round not certify a
     * range?" was otherwise unanswerable from the artifact alone.
     *
     * Optional for readers, always written by this module: a composed artifact
     * from a build that predates the field has no answer, and a reader that
     * needs one must fail closed (treat absent as unproven) rather than read
     * `undefined` as "proven".
     */
    scopeUnproven?: boolean;
    /**
     * True when every `unreviewedDimensions` entry is a DEPTH claim: it names
     * the one dimension that reads no diff (build-and-test), or it is the
     * machine's own relayed budget/round-cap stop entry — exact minted text,
     * and only while the stop marker exists (`isRelayedStopEntry`). Vacuously
     * true when there are no entries.
     *
     * The anchor reads this beside `scopeUnproven`: a dimension nobody could
     * run and a truncated audit over receipt-proven lines say nothing about
     * WHICH lines were read, but a whiffed lens says exactly that, and only
     * the orchestrator's prose ever reports it.
     */
    dimensionGapsAreDepthOnly?: boolean;
}
/**
 * Does this `unreviewedDimensions` entry name a dimension that reads no diff?
 *
 * Entries are prose the orchestrator writes, in the shape the skill documents:
 * a dimension name, optionally followed by its own reason after an em-dash
 * (`build-and-test — the integration suite never ran`). Only the head is
 * matched, and only against dimensions whose brief sets `readsDiff: false`
 * (English labels only — the entries are the orchestrator's English prose;
 * `publicLabelZh` is a rendering concern).
 */
export declare function isNonDiffDimensionGap(entry: string): boolean;
export declare function composeReview(input: ComposeReviewInput, cliVersion?: string, attribution?: boolean, 
/**
 * The model identity the RUNTIME publishes as active — `QWEN_CODE_MODEL`,
 * injected by the two CLI boundaries from the environment the session
 * exports. The marker's anchor certifies with THIS, never with the
 * model-written state field alone; `input.modelId` is the fallback for
 * runs no session published. Undefined in tests that call this directly.
 */
runtimeModelId?: string): ComposeReviewResult;
/**
 * A set of unreviewed chunk ids, said in the PR author's units.
 *
 * `chunk 28` is the run's own bookkeeping: the id selects a rebuild command
 * on stderr, and nothing on the PR page maps it to code. #7268's posted body
 * was two sentences enumerating all 49 of them — unsorted, because the first
 * group rode transcript order — and the one fact they carried (nothing was
 * certified) is the opener's job, not an enumeration's. The author's units
 * are their files and, at the limit, the diff itself, so the ids collapse to
 * whichever of those fits:
 *
 * - every planned chunk → `the entire diff`;
 * - a gap whose files are known and few → the files, named;
 * - anything wider (or a plan whose chunks carry no files) → a count against
 *   the plan's total.
 *
 * The ids never render. They stay in the structural entries — the caps, the
 * caller-echo dedup and the certification test all key on `chunk <id>` — and
 * in the stderr remediation, where the id is the selector a reader can act
 * on. `plural` is the phrase's grammatical number, for the one caller whose
 * sentence carries a pronoun; `phraseZh` is the same phrase for the Chinese
 * half of a bilingual body.
 */
export declare function describeChunkGap(ids: readonly number[], planned: ReadonlyArray<{
    id: number;
    files: string[];
}>): {
    phrase: string;
    phraseZh: string;
    plural: boolean;
};
export declare function repositoryContextGate(planPath: string): string[];
/**
 * Read the script-lint report the orchestrator wrote and turn it into verdict
 * inputs, deterministically. Returns the pre-confirmed `[lint]` Criticals (a
 * finding on a changed line, above cosmetic `style`) and the unreviewed-scope
 * entries (a checker not installed or crashed, or — owed but absent — a report
 * the run never produced). The path is DERIVED from the plan, never taken from
 * the model's input JSON, and the plan itself decides whether the lint was owed:
 * this is what takes the model out of both the block decision and the proof it ran.
 */
export declare function scriptLintGate(planPath: string): {
    criticals: string[];
    unreviewed: string[];
    disclosed: string[];
};
/**
 * Read the test-plan report and turn its rulings into body notes.
 *
 * Unlike `scriptLintGate`, this one **never caps and never blocks**, and every
 * early return is therefore a plain "nothing to say" rather than a fail-closed
 * disclosure. That asymmetry is deliberate on both halves:
 *
 *   - A Test Plan defect is not a code defect. The author claimed a path that
 *     is not there, or a count from a different suite; the diff is unaffected.
 *     Blocking a merge on it would spend the review's one irreversible action
 *     on a documentation nit, and the skill's design philosophy is that a
 *     comment not worth the reader's time costs more than it returns.
 *   - Capping on a MISSING report would cap essentially every PR, because most
 *     PRs produce no notes at all and a run has no way to prove the difference
 *     between "checked, nothing to say" and "never checked" that is worth the
 *     un-Approvability. This is the `deferred`-checker precedent above: a
 *     limitation the author cannot fix must not become a permanent cap.
 *
 * A stale report is dropped in silence for the same reason a stale one is
 * refused elsewhere — a note about a previous commit's Test Plan is worse than
 * no note, and here there is no cap to fall back to.
 */
export declare function testPlanGate(planPath: string): {
    notes: string[];
};
export declare const composeReviewCommand: CommandModule;
/**
 * The next round's ledger: every finding this review is posting as its own —
 * the drafted inline comments plus the body Criticals. Low-confidence findings
 * never reach either input (they are terminal-only), so the ledger holds only
 * claims the review stands behind, which is what the next round re-asserts.
 */
export declare function buildLedger(round: number, drafted: Array<{
    path?: unknown;
    line?: unknown;
    body?: unknown;
}>, bodyCriticals: string[], 
/**
 * The previous round's work list, when this round recovered one, and
 * whether that list was COMPLETE.
 *
 * A claimed id that names no entry in a complete list is a stray — a
 * model-written token, not a carry — and recording it mints a finding
 * under a round that never held it, which the next round's recurrence
 * join then CITES in a posted paragraph and counts toward the depth key.
 * The completeness flag is what separates a stray from a legitimately
 * re-voiced entry the marker's byte budget shed: over a shortened list
 * this cannot be told apart, so the id is retained and continuity wins.
 */
carriedWorkList?: {
    ids: ReadonlySet<string>;
    complete: boolean;
}): Ledger;
/** The terminal verdict, in the words Step 6 is told to print. */
export declare function verdictLine(r: ComposeReviewResult): string;
