/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** One finding the review stands behind, carried to the next round. */
export interface LedgerFinding {
    /**
     * The finding's id. A **new** finding gets `R<round>-<n>`; a finding carried
     * forward from an earlier round keeps the id it already has — Step 6 re-reports
     * a still-standing entry under its original id, and `buildLedger` reads that id
     * back off the comment body, so `R1-2` names the same claim in every round.
     * Renumbering it by position would hand the next round a work list keyed by
     * ids the report it accompanies never used.
     */
    id: string;
    /** `C` (Critical) or `S` (Suggestion). Compact on purpose — body bytes. */
    sev: 'C' | 'S';
    file: string;
    /**
     * Set only when `file` is a LITERAL path that happens to equal one of the
     * stand-in names below — `(body)`, `(unknown)`. Git permits both as
     * filenames, so the sentinels alone cannot separate "no path to give" from
     * "a file with that name", and a reader keying on the value excluded a
     * real file of that name from clustering, silently.
     *
     * The flag marks the EXCEPTION rather than the rule on purpose. Flagging
     * the stand-ins would have cost bytes on every body Critical, which is
     * routine — and this field rides through all four rungs of the shed
     * cascade, where the serializer's own comment prices ~27 bytes of
     * telemetry at a lost anchor or a lost ruling. Flagging the pathological
     * filename instead costs nothing on any normal round, and it lets a marker
     * written before this field existed read correctly: its sentinels carry no
     * flag, which is exactly what they mean.
     */
    k?: 1;
    line?: number;
    /** One line, capped — enough for the next round to re-locate the claim. */
    title: string;
}
export interface Ledger {
    v: 1;
    round: number;
    findings: LedgerFinding[];
    /**
     * How many findings the size cap dropped, when it dropped any. Absent means
     * the list is complete — which is the claim the next round acts on, so the
     * incomplete case has to say so rather than look identical to it.
     */
    dropped?: number;
    /**
     * The head commit this round reviewed — the anchor the next round scopes its
     * incremental diff from. This is the marker's second job, and the one the
     * local cache could never do for CI: a fresh environment recovers the
     * previous findings from the posted body but had nowhere to recover "last
     * reviewed at", so its incremental range always degraded to the full diff.
     * Absent on a fail-closed round ON PURPOSE — a run that could not show it
     * READ the whole diff must not hand the next round an anchor that scopes
     * past the part it missed. "Fail-closed" here is the net `ledgerMarkerFor`
     * computes (any undecided blocker, unproven coverage, or any cap in the
     * verdict the module derived other than `unreviewed-dimension` — a
     * dimension nobody could run says nothing about which lines were read), and
     * Step 8's cache-skip rule names the same net for `lastCommitSha` — the two
     * anchors must not disagree about what a clean round is. The findings
     * still ride; only the anchor is withheld.
     *
     * It also never crosses accounts: `pr-context` strips it from a marker
     * another account posted, so a foreign body can never decide which lines
     * this pipeline stops looking at.
     */
    sha?: string;
    /**
     * The model that certified `sha` — incremental scoping is a SAME-MODEL
     * contract. "Clean up to the anchor" is one model's verdict: the local
     * cache has always paired its anchor with `lastModelId` and Step 1 refuses
     * the same-SHA shortcut across models, but the marker carried its anchor
     * bare, so a round that recovered it from the posted body would scope
     * `sha..HEAD` past code the CURRENT model never reviewed — permanently,
     * since each clean round re-anchors past the last. Rides and falls WITH
     * the anchor: the serializer withholds it whenever it withholds `sha`
     * (fail-closed or truncated rounds) — and withholds the PAIR when the
     * model itself does not fit the cap, since a truncated id is a prefix and
     * a prefix can equal another model's full id — and the parser drops it
     * when the sha beside it did not survive (or it exceeds the cap) — a
     * model naming no range qualifies nothing.
     */
    model?: string;
    /**
     * How many inline comments this round posted — convergence telemetry, and
     * the ONLY field here that decides nothing.
     *
     * Every other field gates something (`findings` is the next round's work
     * list, `sha`/`model` scope its diff, `dropped` withholds that scoping),
     * which is why they all fail closed. These two are read by no gate: they
     * exist so a later round — or a caller applying its own policy — can see
     * whether the loop's posting volume is shrinking, without asking the
     * model or counting a comment list that cannot distinguish this account's
     * rounds from anyone else's. A tampered or absent value costs a trend
     * line and nothing else, so they fail OPEN (absent) rather than
     * withholding anything.
     *
     * Kept across a truncated list on purpose, unlike the anchor pair: a
     * `dropped` work list says the next round cannot scope from here, not
     * that this round posted a different number of comments than it did.
     */
    posted?: number;
    /**
     * The PREVIOUS round's `posted`, carried forward so one marker holds a
     * two-round window: a round reading this marker knows its predecessor's
     * volume AND the one before that, which is the shortest window in which
     * "still shrinking" is a statement rather than a single step. Same
     * fail-open, decides-nothing contract as `posted`.
     */
    prevPosted?: number;
    /**
     * The posting floor this round RESOLVED to — `c` when the critical floor
     * was in effect, `o` when Suggestions were postable.
     *
     * It qualifies `posted`, and travels and sheds with it. Without it the
     * volume trend measures a POSTURE change as loop divergence: an operator
     * who takes this pipeline's own advice and sets `--severity-floor
     * critical` collapses the volume, and restoring it later produces a jump
     * the trend reads as a loop that will not settle — and then advises
     * re-tightening the floor just deliberately loosened. The bias is
     * one-directional (loosening fires it, tightening only shrinks volume),
     * and one transient `contextUnavailable` round under `auto` produces the
     * same spike with no operator action at all.
     *
     * Same fail-open, decides-nothing contract as the volumes: absent means
     * "not recorded", which leaves the trend evaluated as it was before this
     * field existed.
     */
    floor?: 'c' | 'o';
    /**
     * How many of `posted` were findings this round REPORTED FOR THE FIRST
     * TIME — not re-posts of still-standing entries from earlier rounds.
     *
     * The number the convergence trend is actually about. `posted` is the
     * round's whole output, and Step 6 re-posts every unfixed ledger Critical
     * under its original id, so the re-post floor only ever rises: a loop whose
     * NEW findings collapsed from five to one still posts more comments than
     * the round before, and a trend measured on the totals reads that
     * convergence as divergence, permanently. Absent means "not recorded",
     * which leaves the trend unevaluable rather than measured on the wrong
     * number.
     *
     * Rides and sheds with `posted`, which it qualifies.
     */
    fresh?: number;
}
/**
 * A usable anchor: abbreviated-to-full hex, matching what `git rev-parse`
 * emits. The parser drops a field that fails this rather than the ledger —
 * the findings are still a work list even when the anchor is garbage — and
 * `fetch-pr --since` additionally validates the anchor against the fetched
 * history — existence always; ancestry except on Aone, where AGit-Flow
 * amends orphan the cached head (design D7) — before scoping to it (in the
 * CLI; the orchestrator never runs git against an anchor). The published
 * scope is joined against the CR's own diff either way, so a tampered sha
 * costs a full-range review, never a mis-scoped one.
 *
 * Exported because `fetch-pr --since` gates on the SAME shape: an anchor the
 * marker will not carry must not be one the fetch accepts, or a
 * ledger-blessed anchor and a cache-supplied one would be judged by two
 * predicates that can drift (a second, case-insensitive copy shipped once).
 * One answer about the shape, applied at every gate that reads an anchor.
 *
 * Sibling check, deliberately not shared: `repo-context.ts` validates
 * `plan.mergeBaseSha` as a FULL 40/64-char object id and hard-throws — that
 * field comes from the trusted plan and is then resolved via git. This one
 * fail-quietly filters a possibly-abbreviated anchor out of an untrusted
 * body. Two claims, two strictnesses; one shared helper would invite using
 * the loose one where the strict one is meant.
 */
export declare const SHA_RE: RegExp;
/**
 * Grammar of a ledger finding id (`R<round>-<n>`). Shared by every site
 * that reads carried ids — compose-review's re-post prefix parser and
 * presubmit's carried-id extractor — so the two ends cannot drift: a
 * divergence makes re-posts read as plain overlaps and get dropped,
 * silently re-creating #9208.
 */
export declare const LEDGER_ID_TOKEN: string;
/**
 * Prefix-anchored readback of a carried id off the claim line: the write side
 * guarantees the id leads the line right after the severity marker, so the
 * read sides key on that same position. Shared WHOLESALE — terminator
 * included — by compose-review's ledger builder and presubmit's re-post
 * extractor, so the tolerated terminator set cannot drift on one end only
 * (#9212 review). The earlier `\b`-bounded whole-body scan also matched
 * cross-references ("see R3-2 for context") and ids embedded in longer
 * hyphen runs, exempting a re-post under an unrelated thread.
 */
export declare const LEDGER_ID_READBACK: RegExp;
/**
 * The id as a WHOLE string — nothing before it, nothing after. The one
 * admission test, shared with presubmit's entry check.
 *
 * Anchored at both ends on purpose. A prefix-only test (`^R\d+-`) admitted
 * ids the readers then interpreted differently from the test: every reader
 * downstream trims before matching (`birthRound`, `readClaim`), so ` R9999-1`
 * failed the untrimmed squat filter, was therefore never dropped, and read as
 * round 9999 everywhere it mattered — pre-claiming the next round's id prefix
 * and citing a round no account ever ran.
 */
export declare const LEDGER_ID_SHAPE: RegExp;
/** Caps keep the marker a footnote, never a payload: GitHub's body limit is
 *  65,536 chars and the marker rides inside it. Every cap binds BOTH halves —
 *  the serializer so the write side is bounded, the parser so a hand-edited
 *  marker cannot exceed what the serializer would have written. */
export declare const LEDGER_MAX_FINDINGS = 50;
export declare const LEDGER_MAX_TITLE = 80;
export declare const LEDGER_MAX_FILE = 200;
/**
 * The pseudo-paths a finding carries when it has no file to name: a body-only
 * Critical anchors to the review body itself, and a drafted comment that
 * arrived without a path anchors to nothing at all.
 *
 * Named here because BOTH ends must agree. The ledger builder stamps them into
 * `findings[].file`, and every reader that must not treat them as real files
 * compares against them — the convergence join excludes them from clustering.
 * Spelled as bare literals on each end, a rename on one end alone turns a
 * pseudo-path into an ordinary file the reader clusters on and NAMES in a
 * posted paragraph: the same two-ends drift the shared id constants above
 * exist to prevent.
 */
export declare const LEDGER_BODY_FILE = "(body)";
export declare const LEDGER_UNKNOWN_FILE = "(unknown)";
/**
 * Is this path spelled like one of the stand-ins? The one place that
 * question is asked, so the writer's exception flag and the reader's
 * exclusion cannot disagree about which names need disambiguating.
 */
export declare function isStandInName(file: string): boolean;
/**
 * The longest model id the marker can carry — and it carries one WHOLE or
 * not at all: a truncated id is a prefix, and a prefix can equal a DIFFERENT
 * model's full id, which the same-model gate would then accept past code it
 * never reviewed. An id over this cap takes the whole anchor pair with it,
 * degrading recovery to the full diff — the fail-safe direction. Real ids run
 * short even qualified by their provider (`qwen3.7-max@1a2b3c4d` — the model,
 * `@`, and eight hex); the cap bounds the marker, not them.
 */
export declare const LEDGER_MAX_MODEL = 64;
/**
 * The id, capped like every other field it travels with.
 *
 * It was the one field with no bound, which was survivable while only this
 * account's own markers were ever parsed. Recovery now crosses accounts, so
 * the read path takes text any GitHub user can post: an id is a short label
 * (`R2-1`), and anything longer is not one.
 */
export declare const LEDGER_MAX_ID = 24;
/**
 * The highest round a marker may claim.
 *
 * The round is not decoration: `compose-review` stamps this round's findings
 * `R<round + 1>-<n>`, so the number IS the id space. Recovery now prefers the
 * highest round it can find — the counter only ever advances, so that is what
 * keeps ids monotonic across accounts — which means an unbounded round from
 * any poster wins every recovery from then on. At 2^53 the increment stops
 * advancing in float64 and every subsequent round re-stamps the same ids
 * against different findings. Ten thousand rounds is far past any real PR and
 * far short of where the arithmetic breaks.
 */
export declare const LEDGER_MAX_ROUND = 10000;
/**
 * The volume fields' ceiling. A round posting more than this many inline
 * comments is past anything the API or a human review surface tolerates, and
 * the cap exists for the same reason the round's does: the number is written
 * from a count this module does not own, and an unbounded one spends the
 * marker's byte budget on digits.
 */
export declare const LEDGER_MAX_VOLUME = 100000;
/**
 * The ONE reading of a volume field: a non-negative whole number, clamped to
 * the cap — or `undefined` for anything else.
 *
 * Shared by every boundary that reads one (the serializer, the parser, and
 * `compose-review`'s side-file recovery) because the shape check and the
 * clamp have to travel together: a boundary that validated without clamping
 * let one compose emit an uncapped number to its terminal line while its own
 * marker recorded the capped one — two outputs of a single round disagreeing
 * about the same count.
 *
 * Zero survives on purpose: "this round posted nothing" is exactly the
 * observation a convergence trend is looking for, and dropping it would make
 * a converged round indistinguishable from one that never recorded a volume.
 */
export declare function volumeOf(n: unknown): number | undefined;
/**
 * ...and a cap on the WHOLE marker, because the per-field ones do not bound it:
 * fifty findings at full width serialize to just under 17,000 characters.
 *
 * The budget is set against measurement, not against the 65,536 body limit.
 * Across every review this pipeline has posted on its own stack (n=66), the
 * body runs a median of 721 characters, p90 2,178, max 3,925 — so the limit
 * has ~61 KiB of headroom and an over-long marker was never going to 422 the
 * post. What the 17,000 would do is put four times more invisible payload than
 * visible review into the comment, and "footnote, never a payload" is the
 * claim the paragraph above makes. 8 KiB holds the largest ledger a real round
 * has produced without truncating anything, and stays about twice the biggest
 * body observed rather than four times it.
 */
export declare const LEDGER_MAX_BYTES = 8192;
/**
 * Serialize for embedding, capped and comment-safe.
 *
 * `--` would close the HTML comment early and spill the tail onto the PR page
 * as visible text, so none may survive into the payload. The escape is applied
 * at the JSON layer rather than by rewriting the data: the second dash becomes
 * a `\u002d` escape, which parses back to a literal `-`, so a title quoting
 * `--comment` reaches the next round verbatim — where the earlier rewrite to an
 * em dash delivered `—comment`, on a work list whose whole job is to re-locate
 * the claim it names. Escaping the serialized text also means a field added to
 * `Ledger` later cannot reintroduce the hazard by being forgotten below.
 */
export declare function serializeLedger(ledger: Ledger): string;
/**
 * Is this a ledger finding this pipeline would admit, against the round the
 * marker (or side file) claims?
 *
 * The ONE admission test. `parseLedger` applies it to a marker recovered from
 * a posted body; `compose-review`'s side-file read applies it to the JSON
 * `pr-context` wrote — the same untrusted shape arriving by a different
 * route. That read restated two of these checks and skipped the rest, which
 * is how a side file written before the id hardening could keep an id the
 * marker path now rejects and publish a round number off it: a reader that
 * trims is only as strict as the admission test in front of it.
 */
export declare function isLedgerFinding(f: unknown, markerRound: number): f is LedgerFinding;
/**
 * A finding normalised to the caps the serializer writes under. Applied on
 * READ too: the caps are the serializer's contract, and neither a
 * hand-edited marker nor a side file is bound by it.
 */
export declare function normalizeLedgerFinding(f: LedgerFinding): LedgerFinding;
/**
 * Parse the ledger out of a posted review body. Null on absence or ANY
 * malformation — the body is another account's writable surface, and a marker
 * that does not parse contributes nothing rather than throwing.
 */
export declare function parseLedger(body: string | undefined): Ledger | null;
/**
 * Strip the marker from a body about to be rendered for a model — the JSON
 * blob is noise there; the parsed copy travels separately.
 *
 * EVERY marker, not the first. `parseLedger` deliberately reads the LAST one
 * because an edited or quote-carrying body can hold more than one, so a
 * stripper that removed only the first left exactly the marker the parser
 * trusts sitting in the model-facing prose — and left a canonical LGTM
 * unmatched by its `^…$`-anchored filter, which is the no-op-round noise the
 * filter exists to remove.
 */
export declare function stripLedgerMarker(body: string): string;
