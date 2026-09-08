/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** The size inputs the budget is derived from. */
export interface BudgetInput {
    /**
     * Diff lines in `source` files — the same number the topology gate turns on,
     * and for the same reason: test and prose lines inflate a diff without adding
     * anything for a reviewer to get wrong.
     */
    srcDiffLines: number;
    /** Total diff lines, including tests, prose and generated files. */
    diffLines: number;
}
/**
 * The two facts about the machine that the round cap depends on.
 *
 * Both are resolved by the capture command and passed in rather than read
 * here: this module has no imports, and a budget that loaded settings or
 * inspected `process.env` would make every caller's tests depend on the
 * machine they run on. They arrive together because they answer the same
 * question from two sides — how many reverse-audit rounds this plan may run.
 */
export interface BudgetContext {
    /**
     * The standing `review.reverseAuditRounds` setting, when the operator set a
     * usable one — a settings value, not an environment one. It can only lower
     * the round tier; see `cappedRoundTier`.
     */
    operatorRoundCap?: number;
    /**
     * Is `QWEN_REVIEW_DEADLINE_EPOCH` set to something the gates will honour?
     * This decides whether the huge tier's finishability reduction applies at
     * all; see `HUGE_REVERSE_AUDIT_ROUNDS`.
     */
    hasDeadline?: boolean;
}
export interface ReviewBudget {
    /**
     * How many of the low tier's directed angles to walk (Step 3C, A–F).
     *
     * Always at least 3, because the three that are always worth walking are the
     * ones defined by *how they walk* rather than by a topic — line-by-line,
     * removed behaviour, and the language's own pitfalls — and each is answerable
     * on a diff of any size. The rest earn their turn as there is more to see.
     */
    inlineAngles: number;
    /**
     * Does the low tier's gap sweep run?
     *
     * The sweep re-reads the diff as a fresh reviewer holding the deduplicated
     * list, hunting only for what is not on it. On a diff small enough to hold
     * entirely in view, a second reader of the same few hunks is the same reader:
     * there is no "what did the first pass not get to" when the first pass got to
     * all of it.
     */
    sweep: boolean;
    /**
     * The cap on Agent 8 diff-specialized finders (high effort only).
     *
     * Zero below the floor, and that is the substantive half of this field. A
     * specialist is launched when "one domain dominates the diff", which is a
     * judgement — and a judgement made about forty lines will find a dominant
     * domain every time, because forty lines are usually all one thing. Dominance
     * is only meaningful once there is enough code for a diff to have been about
     * several things and not be.
     */
    specialistCap: number;
    /**
     * Findings per Step 4 verification agent — `ceil(N / verifyShard)` agents.
     *
     * Flat by design; it is here so the number has one home rather than being
     * re-stated in the skill's prose and in whatever reads it. It is a property of
     * how much a verifier can re-trace before its quality collapses on the tail of
     * its list, which is a fact about the verifier and not about the diff.
     */
    verifyShard: number;
    /**
     * Soft tool-call ceiling baked into every finder/auditor brief — not the
     * verifier, whose load `verifyShard` already governs, and not Build & Test,
     * whose calls are deterministic commands.
     *
     * A fan-out wave's wall clock is its slowest agent, and the slowest agent
     * is reliably a wanderer: two measured runs of the SAME 14-agent wave took
     * 11.7 and 41 minutes, the difference being individual agents spending
     * 40-100 model calls exploring the tree, while healthy agents on
     * comparable diffs settle in the 25-45 range. The ceiling is SOFT: the
     * brief tells the agent to stop exploring at the budget, write its
     * findings from the evidence in hand, and disclose what it did not get to
     * — a disclosed gap feeds the whiff and receipt machinery; an undisclosed
     * crawl only feeds the wall clock.
     */
    agentToolBudget: number;
    /**
     * The reverse-audit loop's round cap, **one value per topology**
     * (`reverseAuditRoundTier`): `SMALL_REVERSE_AUDIT_ROUNDS` on a 3A diff,
     * `LARGE_REVERSE_AUDIT_ROUNDS` on a 3B one, and a reduced
     * `HUGE_REVERSE_AUDIT_ROUNDS` for a diff large enough that the full loop
     * cannot finish inside any budget.
     *
     * A reverse-audit round re-reads the diff against a growing findings
     * list, so its cost scales with the diff — one auditor on 3A, one per
     * non-retired chunk on 3B, and ~90 minutes a round on a 4,000-line PR,
     * where five rounds alone (450 min) exceed the six-hour CI ceiling before
     * the fan-out and tail are even counted. That spread is why this is not
     * one number: the same cap cannot price a single agent and a 19-way
     * fan-out. In a time-budgeted CI run the deadline gate already refuses a
     * round that will not fit; this static cap is the belt it works under and
     * the ONLY bound a local run (no deadline) has — which is also why the huge
     * tier's reduction does not apply to such a run at all: with no ceiling to
     * fit inside there is nothing for it to answer, so a huge diff without a
     * deadline reads the 3B tier. Where a deadline does exist the huge tier is
     * reduced to three, not two — not because two cannot converge (the all-dry
     * rounds-1-and-2 shape reaches CONVERGED at the round-3 build under any
     * cap of two or more, since the convergence check runs before the cap
     * gate) but to buy hot chunks one extra audit round before the cap.
     *
     * The budget tunes how many rounds the loop runs, never whether it runs:
     * the reverse audit is a dimension of the high-effort contract. What the CLI
     * writes here is a tier value, or — when the operator set a
     * `review.reverseAuditRounds` ceiling below it — that ceiling.
     */
    reverseAuditRounds: number;
}
/**
 * The reverse-audit round cap for a **3A** diff (SKILL.md Step 5's "stop at
 * the plan's `reverseAuditRounds` cap").
 *
 * Ten, because on 3A a round is **one auditor reading the whole diff** — the
 * marginal round is a single agent on a diff small enough to hold in one
 * context, against a whole review of 17-28 calls (17-23 before this tier, so
 * the five extra rounds are five calls). Five was never a 3A price:
 * it is the 3B arithmetic (`rounds × chunks`) applied to a topology where
 * that arithmetic does not hold, and it stopped loops that were still
 * confirming Criticals for a saving of ~5 calls. The loop's real terminator
 * is two consecutive dry rounds; every cap here is the belt under it.
 */
export declare const SMALL_REVERSE_AUDIT_ROUNDS = 10;
/**
 * The reverse-audit round cap for a **3B** diff — the historical value, and
 * still the right one where a round costs one auditor per non-retired chunk
 * (`19 × 5 = 95` on PR #6457's shape, before retirement trims the odd
 * rounds). `compose-review` imports it directly as the cap it names when a
 * stop marker arrives without one.
 */
export declare const LARGE_REVERSE_AUDIT_ROUNDS = 5;
/**
 * The reduced cap for a huge diff — three, one audit round above the
 * convergence floor of two, spent on hot chunks before the cap stops the
 * loop. Not a convergability minimum: the all-dry rounds-1-and-2 shape
 * reaches CONVERGED under any cap of two or more, because the reverse
 * audit's convergence check runs before the round-cap gate.
 *
 * **Applied only when the run has a deadline.** This is not a claim that a
 * huge diff converges sooner — it plainly does not; it has more defects and
 * more territory, and on the recall axis it deserves MORE rounds than a small
 * one, not fewer. It is a claim about a wall: five ~90-minute rounds do not
 * fit a six-hour CI ceiling, and a review killed mid-flight posts nothing at
 * all, so three rounds reported beat five rounds lost (measured; DESIGN.md —
 * The six-hour timeouts). Where no wall exists — a local run with no
 * `QWEN_REVIEW_DEADLINE_EPOCH` — the premise is absent and so is the
 * reduction: a huge diff is then just a large 3B diff and gets the 3B tier.
 * Trading recall away to fit a ceiling that is not there is a pure loss, and
 * the tier this reduction cuts from is the one where recall matters most.
 */
export declare const HUGE_REVERSE_AUDIT_ROUNDS = 3;
/** A plan, as far as a size-derived decision needs it. */
export interface DiffSize {
    srcDiffLines?: unknown;
    diffLines?: unknown;
}
/**
 * The topology gate, in code.
 *
 * The same two numbers the skill's prose turns on. It is here so the roster,
 * the reader and the round cap cannot disagree about which fan-out was owed —
 * a disagreement that would show up as a review being told it forgot eleven
 * agents it was never supposed to launch. It lives in `budget.ts` rather than
 * in `roster.ts` because it is a *size* ruling and this module is where size
 * rulings live; `roster.ts` imports it back (this module has no imports of its
 * own, so the direction cannot cycle).
 */
export declare function isTerritoryFanOut(plan: DiffSize): boolean;
/**
 * The reverse-audit round cap this diff's **topology** earns.
 *
 * One number per topology, because the thing being capped costs two orders of
 * magnitude more in one than in another: a 3A round is one auditor (minutes),
 * a 3B round is one auditor per non-retired chunk, and a huge-diff round is
 * ~90 minutes. A single cap is therefore either useless at one end or
 * crippling at the other, and five was both — too loose to bound the huge
 * case (the 6-hour CI reviews that posted nothing) and tight enough on 3A to
 * stop loops that were still confirming Criticals.
 *
 * The huge tier is checked first and wins: it is a *finishability* ruling, and
 * a huge diff is territory-fanned-out by construction anyway.
 *
 * A plan carrying no usable size — an older CLI's, or a garbled one — reads as
 * the LARGE tier, which is what every plan gets today. The skew case is
 * therefore never handed more rounds than it already runs with, which is the
 * safe direction for a bound (the rest of this module's fallbacks err toward
 * more *coverage*; this one errs toward less *cost*, because an unsized plan
 * could be the 5,800-line one).
 *
 * **Usability is judged before coercion, not after.** `Number()` turns `null`,
 * `''`, `false` and `[]` into a finite `0`, so a coerce-then-`isFinite` check
 * calls them usable and hands a plan whose sizes are unknowable the SMALL
 * tier — the most expensive one — while the sibling `{}` correctly falls back.
 * That shape is not hypothetical: `JSON.stringify` writes a `NaN` line count
 * as `null`, so the corrupted plan this fallback exists for arrives looking
 * exactly like a zero-line diff. A numeric-string size (`"1"`) coerces too,
 * which would have let a hand-edited huge plan reach the SMALL tier through
 * the very clamp `reverseAuditRoundCap` adds to prevent it.
 */
export declare function reverseAuditRoundTier(size: DiffSize, hasDeadline: boolean): number;
/**
 * The round cap to record, given the topology tier and what the operator asked
 * for — **the operator may only lower it.**
 *
 * The asymmetry is the whole design of this knob, and it is not timidity about
 * letting people configure things. Raising is refused because a single
 * configurable number is precisely what tiering removed: a round is one agent
 * on a small diff and ~90 minutes on a huge one, so one operator-chosen count
 * is wrong for at least one topology, and the topology it is most wrong for is
 * the one whose cap exists to stop six-hour reviews that post nothing.
 * Lowering carries no such hazard — it can only end the loop sooner.
 *
 * The two ways an operator actually means "run it longer" both have direct
 * expressions elsewhere, and neither is a round count: "I have more wall clock
 * than the huge tier assumes" is a review deadline, which the admission gate
 * already prices a round against; "keep going while it is still finding real
 * defects" is a property of the findings, not of a number chosen in advance.
 *
 * Below `HUGE_REVERSE_AUDIT_ROUNDS` is refused too, for the reason
 * `reverseAuditRoundCap` refuses it in a plan — though not the reason an
 * earlier draft of this gave. A cap of **one** refuses the convergence pair's
 * second member, so the loop cannot produce the two dry audits convergence is
 * defined by and every run stops non-converged. A cap of **two** does let an
 * all-dry loop converge (the convergence check runs before the cap gate), but
 * it leaves no round at all for a loop that reports anything, so the first
 * finding makes the stop non-converged. Either way the purchase is a capped
 * verdict rather than a cheaper review.
 */
export declare function cappedRoundTier(size: DiffSize, operatorCap: number | undefined, hasDeadline: boolean): number;
export declare const MIN_INLINE_ANGLES = 3;
export declare const MAX_INLINE_ANGLES = 6;
export declare const VERIFY_SHARD = 8;
/**
 * The floor is what a small diff's walk legitimately needs (brief + chunk
 * reads + a handful of enclosing-function reads and greps); the ceiling sits
 * above every healthy per-agent count measured on real reviews (25-45) and
 * below the wandering pathology (40-100+). One extra call per twenty
 * effective lines lets a larger territory earn a longer walk.
 */
export declare const MIN_AGENT_TOOL_BUDGET = 30;
export declare const MAX_AGENT_TOOL_BUDGET = 60;
/**
 * The review budget for a plan.
 *
 * Negative, non-finite and absent inputs all read as zero rather than throwing:
 * this is computed while a plan is being written, and a plan that fails to write
 * because a line count arrived as `NaN` costs the whole review, while a budget
 * that lands on its floor costs one under-walked small diff. It fails toward the
 * cheap end on purpose — the floors are the *minimum* work, not the maximum, so
 * a garbled input still walks three angles and still verifies.
 *
 * `context` carries the two facts about the machine the round cap depends on;
 * see `BudgetContext`. Nothing else in the budget is tunable from outside, and
 * that stays true: the rest of these fields size the work a review owes, and a
 * caller who can shrink them is a caller who shrinks them.
 */
export declare function reviewBudget(input: BudgetInput, context?: BudgetContext): ReviewBudget;
/**
 * The reverse-audit round cap a **plan** carries, for every reader that
 * enforces or narrates it (the admission gate and the cold-check note, both
 * in `agent-prompt`; the retirement scheduler deliberately ignores the cap —
 * whether a scheduled cold check is allowed is the note composer's question,
 * not the schedule's).
 *
 * It takes the whole plan, not `plan.budget`, because the accepted range is
 * now the plan's **own topology tier** rather than a global band — and
 * `hasDeadline` because that tier is clock-dependent on a huge diff (3 with a
 * deadline, 5 without). A reader that sees a different clock than the capture
 * did therefore clamps against a different band, which is safe in the
 * direction that matters: a plan captured without a clock and read under one
 * is cut to the shorter tier, never the reverse. What that
 * buys, stated as what actually happens rather than as a slogan:
 *
 *  - **A hand-edited plan cannot cross tiers.** The field is CLI-written and
 *    nothing here is the caller's to override; clamping to the tier means a
 *    `reverseAuditRounds: 10` typed into a 5,800-line plan buys nothing,
 *    which a single upper bound of ten would have honoured.
 *  - **A plan with no `reverseAuditRounds` at all** — a pre-budget CLI's —
 *    reads as its topology's tier instead of one flat number.
 *
 * Two things this does NOT do, both of which an earlier draft of this comment
 * claimed and the code never did:
 *
 *  - It does **not** upgrade a legacy small plan to ten. A CLI that predates
 *    tiering wrote `reverseAuditRounds: 5`, and 5 is inside a 3A plan's
 *    `[3, 10]` band, so it is honoured as 5. Only an absent or out-of-band
 *    value ever reaches the tier. Migrating in-band values would mean
 *    overriding a number the plan states, which is the one thing a reader of
 *    a CLI-written field must not do.
 *  - It does **not** always err toward more auditing. A field-less **huge**
 *    plan reads 3 where the flat fallback read 5 — deliberately less — but
 *    only in a run that has a deadline; without one the huge tier is 5 and the
 *    fallback is unchanged. The reduction is a finishability ruling, and the
 *    reviews it exists for are the ones that ran six hours and posted nothing.
 *
 * The range stays floored at `HUGE_REVERSE_AUDIT_ROUNDS`, the smallest cap
 * the CLI ever writes. A value of one or two is out of band (a hand-edited
 * plan): one cannot reach convergence at all, and two leaves no round for a
 * loop that reports anything — see `cappedRoundTier` for why neither buys a
 * cheaper review. Both fall back to the tier, never less.
 */
export declare function reverseAuditRoundCap(plan: unknown, hasDeadline: boolean): number;
/**
 * The per-launch tool ceiling: the exploration allowance for this launch,
 * PLUS the launch's mandatory reads.
 *
 * Review findings shaped every term here. A whole-diff role on a
 * 25,000-line diff is ASSIGNED 63 chunk reads — a flat 60-call cap is
 * exhausted by the reading list before any analysis begins, so mandatory
 * reads ride on top of the allowance, never inside it. A scoped agent (one
 * chunk, one heavy file) inheriting the whole-diff ceiling keeps exactly
 * the wandering headroom the budget exists to cut, so a scoped launch's
 * allowance is derived from its own territory at the same rate. And the
 * plan's recorded number stays the authority for every launch — the skill
 * promises "every reader sees one number", so the scoped derivation may
 * only LOWER the plan's allowance, never raise it, and the plan's value is
 * clamped into the same [floor, ceiling] band in both directions: a
 * version-skewed or hand-edited plan carrying `0.5` or `100000` must not
 * become a three-call or a hundred-thousand-call brief.
 *
 * `territoryLines: null` is a whole-diff launch — no territory smaller
 * than the plan's, so the clamped plan allowance is used as-is.
 */
/**
 * The hard ceiling on the TOTAL a brief may state. The allowance is
 * clamped, but the reads term comes from the same unchecked-cast plan —
 * a garbled `chars` of 1e9 flowed through as a forty-thousand-call
 * brief, the exact number the clamp exists to make impossible. High
 * enough that no legitimate reading list reaches it (a 63-chunk 3B
 * fan-out with paged chunks and the findings list sits well under),
 * low enough that a garbled plan cannot erase the ceiling.
 */
export declare const MAX_TOTAL_TOOL_CALLS = 200;
export declare function launchToolBudget(planBudget: number, territoryLines: number | null, mandatoryReads: number): number;
/**
 * The disclosure marker ANYWHERE in a line — for the one consumer that
 * cannot rely on the own-line format: a receipt clause with the disclosure
 * appended after the separator (`No new issues found — …; Budget gap: X`)
 * would otherwise absorb the gap text as its own substance. The general
 * parser deliberately stays line-anchored (a mid-line mention is how the
 * format is QUOTED); this is only for cutting a clause, never for minting
 * gaps.
 */
export declare const INLINE_BUDGET_GAP_RE: RegExp;
/**
 * Every budget-gap disclosure in an agent's final return, sanitized for the
 * two places it lands: an operator's terminal (stderr NOTE) and the posted
 * review body. Dangerous codepoints are stripped, each gap is capped in
 * length (on code points) and the list in count, duplicates are folded
 * (an agent that states its gap mid-return and restates it in the summary
 * disclosed one gap, not two), and placeholder text (the brief's own
 * `<the check>` template, `none` in any punctuation) is dropped rather
 * than handed to the orchestrator as a gap to rule on.
 */
export declare function budgetGapDisclosures(finalText: string): string[];
/**
 * `finalText` with its budget-gap disclosure lines removed — what the
 * reverse-audit retirement judges a receipt on, so an agent's admission of
 * what it skipped can neither serve as the receipt's substance nor block a
 * receipt that is substantive without it.
 */
export declare function stripBudgetGapLines(finalText: string): string;
