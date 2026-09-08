/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Below this many source lines, a diff is small enough that a second pass over
 * it is the first pass again.
 */
const SWEEP_FLOOR = 25;
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
export const SMALL_REVERSE_AUDIT_ROUNDS = 10;
/**
 * The reverse-audit round cap for a **3B** diff — the historical value, and
 * still the right one where a round costs one auditor per non-retired chunk
 * (`19 × 5 = 95` on PR #6457's shape, before retirement trims the odd
 * rounds). `compose-review` imports it directly as the cap it names when a
 * stop marker arrives without one.
 */
export const LARGE_REVERSE_AUDIT_ROUNDS = 5;
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
export const HUGE_REVERSE_AUDIT_ROUNDS = 3;
/**
 * The effective-line threshold above which a diff is "huge": its reverse
 * audit is capped and its Agent 8 specialists are shed. Set from the
 * timeout survey — the 6-hour CI reviews that ran to zero posted output
 * were 4,000-5,300 line PRs (a single reverse-audit round already ~90 min);
 * 3,000 triggers with margin below that band while leaving the full loop
 * for the common case. `effective` (the plan's source-weighted line-span
 * measure) slightly over-counts against source body lines, which only ever
 * makes this fire a little EARLIER — the safe direction for a
 * finishability gate.
 */
const HUGE_DIFF_FLOOR = 3000;
/**
 * The topology gate's two numbers — the same pair the skill's prose turns on
 * (SKILL.md Step 3: "`srcDiffLines` ≤ 500 and `diffLines` ≤ 3200 — use the
 * dimension fan-out in Step 3A").
 */
const FAN_OUT_SRC_FLOOR = 500;
const FAN_OUT_TOTAL_FLOOR = 3200;
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
export function isTerritoryFanOut(plan) {
    const src = Number(plan?.srcDiffLines ?? 0);
    const total = Number(plan?.diffLines ?? 0);
    return !(src <= FAN_OUT_SRC_FLOOR && total <= FAN_OUT_TOTAL_FLOOR);
}
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
export function reverseAuditRoundTier(size, hasDeadline) {
    const src = size?.srcDiffLines;
    const total = size?.diffLines;
    if (!usableLineCount(src) || !usableLineCount(total)) {
        return LARGE_REVERSE_AUDIT_ROUNDS;
    }
    const effective = effectiveLines(src, total);
    // The huge reduction is a ruling about fitting inside a wall, so it applies
    // only where there is one. Without a clock a huge diff is simply a large 3B
    // diff and gets the 3B tier — see `HUGE_REVERSE_AUDIT_ROUNDS`.
    if (effective >= HUGE_DIFF_FLOOR) {
        return hasDeadline ? HUGE_REVERSE_AUDIT_ROUNDS : LARGE_REVERSE_AUDIT_ROUNDS;
    }
    // The validated pair, not `size` again. Re-reading the raw object here would
    // give the huge gate and the topology gate two independent derivations of
    // the same two numbers inside one function — which is exactly the shape of
    // the defect this function was just repaired for, where one derivation
    // laundered garbage the other rejected.
    return isTerritoryFanOut({ srcDiffLines: src, diffLines: total })
        ? LARGE_REVERSE_AUDIT_ROUNDS
        : SMALL_REVERSE_AUDIT_ROUNDS;
}
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
export function cappedRoundTier(size, operatorCap, hasDeadline) {
    const tier = reverseAuditRoundTier(size, hasDeadline);
    if (typeof operatorCap !== 'number' ||
        !Number.isInteger(operatorCap) ||
        operatorCap < HUGE_REVERSE_AUDIT_ROUNDS ||
        operatorCap >= tier) {
        return tier;
    }
    return operatorCap;
}
/**
 * A line count this module is willing to size a plan from: a real, finite,
 * non-negative `number`. Everything else — absent, `null`, a numeric string, a
 * boolean, `NaN`, `Infinity`, a negative — is a plan whose size is not known,
 * which is a different fact from a plan whose size is zero.
 *
 * Deliberately NOT shared with `sane()` below, which answers the opposite
 * question. `sane()` launders garbage into `0` because its readers (angles,
 * the sweep, the tool budget) have a safe floor to land on; the tier has no
 * such floor — landing on `0` there means "small diff", the costliest cap.
 */
function usableLineCount(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}
/**
 * The plan's source-weighted line-span measure, in one place.
 *
 * A diff that is *all* non-source (docs, a lockfile) still has lines somebody
 * has to read, so a large non-source diff counts at a coarser eighth rate.
 * Both size tiers in this module read it, and two copies of it are two size
 * measures that can drift apart inside one budget object.
 */
function effectiveLines(src, total) {
    return Math.max(src, Math.floor(total / 8));
}
/** Below this, "one domain dominates the diff" is not a finding about the diff. */
const SPECIALIST_FLOOR = 80;
/** Source lines per additional inline angle, above the always-walk three. */
const LINES_PER_ANGLE = 60;
export const MIN_INLINE_ANGLES = 3;
export const MAX_INLINE_ANGLES = 6;
export const VERIFY_SHARD = 8;
/**
 * The floor is what a small diff's walk legitimately needs (brief + chunk
 * reads + a handful of enclosing-function reads and greps); the ceiling sits
 * above every healthy per-agent count measured on real reviews (25-45) and
 * below the wandering pathology (40-100+). One extra call per twenty
 * effective lines lets a larger territory earn a longer walk.
 */
export const MIN_AGENT_TOOL_BUDGET = 30;
export const MAX_AGENT_TOOL_BUDGET = 60;
const LINES_PER_TOOL_CALL = 20;
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
export function reviewBudget(input, context = {}) {
    const src = sane(input.srcDiffLines);
    const total = sane(input.diffLines);
    const effective = effectiveLines(src, total);
    const extraAngles = Math.floor(effective / LINES_PER_ANGLE);
    const inlineAngles = clamp(MIN_INLINE_ANGLES + extraAngles, MIN_INLINE_ANGLES, MAX_INLINE_ANGLES);
    return {
        inlineAngles,
        sweep: effective >= SWEEP_FLOOR,
        // Agent 8 sheds in the huge zone. A specialist is a whole-diff pass on
        // top of the base fan-out, and on a diff too big to finish that extra
        // pass is the marginal cost that guarantees zero posted output — while
        // the per-chunk fan-out already covers the ground. Finishability over
        // an added depth pass, in exactly the band where the review otherwise
        // posts nothing.
        specialistCap: src >= SPECIALIST_FLOOR && effective < HUGE_DIFF_FLOOR ? 2 : 0,
        verifyShard: VERIFY_SHARD,
        agentToolBudget: clamp(MIN_AGENT_TOOL_BUDGET + Math.floor(effective / LINES_PER_TOOL_CALL), MIN_AGENT_TOOL_BUDGET, MAX_AGENT_TOOL_BUDGET),
        // The RAW input, not the `sane()`d pair above. `sane()` launders a garbled
        // count into `0`, and `0` is a perfectly good small diff — so sizing the
        // tier from it would record the SMALL tier's ten rounds for a plan whose
        // size failed to arrive, where the flat cap recorded five. The tier does
        // its own usability check precisely so this call can hand it the truth.
        reverseAuditRounds: cappedRoundTier(input, context.operatorRoundCap, context.hasDeadline === true),
    };
}
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
export function reverseAuditRoundCap(plan, hasDeadline) {
    const tier = reverseAuditRoundTier((plan ?? {}), hasDeadline);
    const v = plan
        ?.budget?.reverseAuditRounds;
    return typeof v === 'number' &&
        Number.isInteger(v) &&
        v >= HUGE_REVERSE_AUDIT_ROUNDS &&
        v <= tier
        ? v
        : tier;
}
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
export const MAX_TOTAL_TOOL_CALLS = 200;
export function launchToolBudget(planBudget, territoryLines, mandatoryReads) {
    const base = clamp(sane(planBudget) || MIN_AGENT_TOOL_BUDGET, MIN_AGENT_TOOL_BUDGET, MAX_AGENT_TOOL_BUDGET);
    const allowance = territoryLines === null
        ? base
        : Math.min(base, clamp(MIN_AGENT_TOOL_BUDGET +
            Math.floor(sane(territoryLines) / LINES_PER_TOOL_CALL), MIN_AGENT_TOOL_BUDGET, MAX_AGENT_TOOL_BUDGET));
    return Math.min(MAX_TOTAL_TOOL_CALLS, allowance + Math.max(0, Math.floor(sane(mandatoryReads))));
}
/**
 * The disclosure an agent writes when the ceiling stopped a check, and the
 * one parser every reader of that disclosure shares. The brief mandates the
 * line form (`Budget gap: <the check>`); `check-coverage` reports the
 * parsed gaps; the reverse-audit retirement strips these lines out of a
 * receipt before judging its substance. One matcher, one home — a second
 * copy is how the brief and its readers drift apart.
 *
 * The scan is LINE-BASED, three reviews' worth of reasons at once:
 *
 *  - A single multiline regex whose prefix class could cross `\n` was
 *    measured at seconds-per-run on pathological-but-ordinary returns
 *    (quoted diff hunks, banner comments) — quadratic backtracking from
 *    every line start. Per-line matching cannot cross lines, so it cannot
 *    backtrack across them.
 *  - The gap must sit on the SAME line as its marker: a bare
 *    `Budget gap:` header used to swallow the following line, turning an
 *    explicit next-line denial into a phantom disclosure.
 *  - QUOTING the format must not read as USING it: lines inside fenced
 *    code blocks and blockquote lines are skipped — this repo reviews its
 *    own PRs, and a reviewer of this very diff quotes these strings. (The
 *    same hazard transcripts.ts guards for tool-call parsing.) Bullets and
 *    numbering stay tolerated: lists are how an agent writes its own
 *    disclosures, and a disclosure lost to a bullet is unobservable —
 *    nothing downstream can tell "no gaps" from "gaps we failed to parse".
 */
// Linear-by-construction, for the same reason the scan is line-based: the
// bullet's leading whitespace rides INSIDE the optional group (no
// overlapping `[ \t]*` pair), and the gap capture is greedy to the end of
// a pre-trimmed line (no lazy-dot vs trailing-whitespace pair) — gap lines
// carrying long whitespace runs must not stall the parse.
const BUDGET_GAP_LINE_RE = /^(?:[ \t]*(?:[-*+]|\d+[.)]))?[ \t]*(`?)[*_~]{0,3}(?:budget gap|预算(?:缺口|不足|用尽))[*_~]{0,3}[ \t]*[:：][*_~]{0,3}[ \t]*(.+)$/i;
/** A cheap pre-filter so the line walk skips returns with nothing to find. */
const GAP_HINT_RE = /budget gap|预算(?:缺口|不足|用尽)/i;
/**
 * The disclosure marker ANYWHERE in a line — for the one consumer that
 * cannot rely on the own-line format: a receipt clause with the disclosure
 * appended after the separator (`No new issues found — …; Budget gap: X`)
 * would otherwise absorb the gap text as its own substance. The general
 * parser deliberately stays line-anchored (a mid-line mention is how the
 * format is QUOTED); this is only for cutting a clause, never for minting
 * gaps.
 */
export const INLINE_BUDGET_GAP_RE = /(?:budget gap|预算(?:缺口|不足|用尽))[*_~`]{0,3}[ \t]*[:：]/i;
/**
 * Templates and non-answers that must not become gaps someone rules on —
 * the agent saying it has nothing to disclose. A phantom gap costs real
 * rounds downstream (a chunk that never retires, a body that discloses
 * "None." on an Approve), so these shapes are dropped.
 *
 * One classifier judges the paren-stripped text, bare and wrapped alike:
 * #8388's posted body disclosed `(none — all planned checks completed)`
 * because a leading `(` defeated the match, and a bare-vs-wrapped split
 * judgment let the two forms diverge on identical content. The vocabulary
 * lives in this one regex for the same reason.
 *
 * The shapes are deliberately NARROW, because the two errors are not
 * symmetric: dropping a REAL gap certifies work that never happened (the
 * failure #8388's body shipped), while keeping a placeholder only
 * over-discloses. Anything outside them survives as a gap:
 *
 *  - the brief's own `<the check>` template, and dash-only text — both
 *    end-anchored, so inner text merely STARTING with them keeps;
 *  - a bare placeholder token in any trailing punctuation (`none`,
 *    `None.`, `no gaps`), and the non-answer idioms `nothing skipped`,
 *    `none found`, `nothing to report`;
 *  - the stayed-under-budget idiom, end-anchored like its siblings
 *    (`N/A - stayed under budget`), with the same position words and
 *    budget qualifiers as the completion tail below (`stayed inside the
 *    tool-call budget`) — one vocabulary for one idiom family; text
 *    continuing past `budget` keeps (`N/A - stayed under budget, but the
 *    Windows matrix never ran`);
 *  - the completion idiom — token, dash, an "all done" head, then a
 *    completion word the text ENDS with (`none — all planned checks
 *    completed`), tolerating one trailing budget adverbial (`none — all
 *    checks above completed within budget` — three of these reached two
 *    posted bodies in one live round because the completion word was not
 *    final). The head alone is not completion (`none — all 5
 *    Windows checks failed to start` keeps), the completion word must be
 *    AFFIRMED (`none — all checks crashed, none completed` keeps), and
 *    the span must not cross an exception (`none — all but the Windows
 *    checks completed` keeps);
 *  - a token followed by a parenthesized completion clause (`None (all
 *    checks completed)`), inner padding tolerated — under the same
 *    negation and exception guards.
 *
 * No two quantifiers overlap on whitespace: a placeholder token followed
 * by a long whitespace run must stay linear (the module header's hazard
 * note applies — this parse runs on every agent return). The completion
 * spans are tempered (a per-character exception lookahead), which keeps
 * them linear too.
 */
// The budget-position vocabulary, spelled ONCE for the whole idiom family:
// the stayed idiom and both completion tails read the same words. As a
// regex literal the family was hand-copied three times, and the copies had
// already drifted twice in two review rounds (`below` missing from one
// branch, the qualifiers from another).
const BUDGET_QUALIFIED = '(?:under|within|below|inside)\\s+(?:the\\s+)?(?:tool(?:[- ]call)?\\s+)?budget';
const COMPLETION_TAIL = `(?:\\s+${BUDGET_QUALIFIED})?`;
/**
 * The same non-answer, written in Chinese.
 *
 * The line DETECTOR above has always been bilingual (`预算缺口` and the
 * full-width colon are in `GAP_HINT_RE`), but this classifier was not — so
 * under `general.outputLanguage: 中文` an agent's "nothing to disclose" became
 * a real gap. Measured on a live review of PR #9094: a reverse-audit agent
 * returned `Budget gap: 无 — 所有检查均完成，未触及工具预算上限。` ("none — all
 * checks completed, the tool budget was NOT reached") and the composed body
 * published `Not explored to full depth (tool budget reached)` quoting that
 * very sentence — the disclosure asserted the opposite of its own evidence.
 *
 * **The completion clause is a CLOSED VOCABULARY, not a span with exclusions.**
 * That is the whole design, and it is the second attempt: the first cut spelled
 * the clause as bounded `.{0,40}` spans that merely refused to cross `但`/`除`,
 * and two rounds of live review walked straight through it — a negation the
 * one-character lookbehind could not see (`还没有完成`, `未能完成`, `难以完成`),
 * a gap clause the span swallowed before the completion word
 * (`3 项未运行，其余完成`) or after it (`安全检查完成，渗透测试未进行`), and a
 * span that slid past a NEGATED completion to a later affirmed one. Every one
 * of those is the unsafe direction: this module's header states the asymmetry —
 * dropping a REAL gap certifies work that never happened, keeping a
 * placeholder only over-discloses.
 *
 * A closed vocabulary cannot be walked through, because there is nothing to
 * walk: the clause matches only if the ENTIRE text after the token is built
 * from these pieces, so any sentence carrying an actual gap simply fails to
 * match and is kept. Adding a phrase is a deliberate edit to this list, not a
 * side effect of loosening a quantifier.
 *
 * Shapes:
 *
 *  - a bare token (`无`, `没有`, `不适用`), optionally with the noun the brief
 *    uses (`无缺口`, `没有跳过的检查`);
 *  - a token, one separator, then the closed completion clause
 *    (`无 — 所有检查均完成`), optionally with one budget adverbial
 *    (`，未触及工具预算上限`).
 *
 * The token needs an explicit boundary — Chinese has no `\b`. `无` is a prefix
 * of `无法…` ("unable to…"), which is a REAL gap and must survive, so a token
 * is only a token when what follows it is punctuation, whitespace, a
 * separator, or the end of the text.
 */
// No bare `检查` in the noun group: `没有检查` reads "did not check" — a live
// gap — and the module's rule for ambiguity is to KEEP. `无缺口` and
// `没有跳过的检查` are the documented placeholder nouns and still drop.
const ZH_TOKEN = '(?:无|没有|不适用|暂无)(?:缺口|跳过的?检查)?';
/** One separator, in the forms a model actually writes (double em-dash too). */
const ZH_SEPARATOR = '[-—–]{1,2}|[、,，:：]';
/** "every planned check", spelled out — no free characters anywhere. */
const ZH_ALL = '(?:所有|全部|一切|全都|统统)';
const ZH_PLANNED = '(?:计划(?:内|中)?的?|预定的?|上述|以上|本轮)';
const ZH_CHECKS = '(?:检查|检查项|项检查|测试|审查|工作)';
const ZH_DONE = '(?:均|都|皆)?(?:已|均已|都已)?(?:完成|完毕|结束|做完)';
/** The one adverbial allowed after the completion word. */
const ZH_BUDGET_TAIL = '(?:[，,、]?\\s*(?:未触及|未达到|未超出|未用尽|没有触及|在|不超过)' +
    '(?:工具)?(?:调用)?预算(?:上限|限制|范围内)?)?';
// ？ (U+FF1F) and 、 (U+3001) mirror the fold key's trailing strip:
// a wrapped placeholder's inner text must judge identically to its
// bare form, which loses those tails before the classifier sees it.
const ZH_TAIL = '[。．.!！…,，;；:：？、\\s]*$';
// NO whitespace between the pieces. Four optional groups chained across `\s*`
// is the overlapping-quantifier shape this module's header bans and its
// 'stays linear on pathological inputs' test exists for — and Chinese does not
// put spaces between these tokens anyway, so the quantifiers bought nothing
// but the backtracking. Whitespace is allowed exactly once, after the
// separator, where a model actually types it.
const ZH_COMPLETION_CLAUSE = `${ZH_ALL}?${ZH_PLANNED}?${ZH_CHECKS}?${ZH_DONE}${ZH_BUDGET_TAIL}`;
const ZH_PLACEHOLDER = `${ZH_TOKEN}(?:${ZH_TAIL}` +
    `|\\s*(?:${ZH_SEPARATOR})\\s*${ZH_COMPLETION_CLAUSE}${ZH_TAIL})`;
const PLACEHOLDER_GAP_RE = new RegExp('^(?:<[^>]*>$' +
    '|[-—*_~`]+$' +
    `|${ZH_PLACEHOLDER}` +
    '|(?:none|n/a|nothing|no (?:gaps?|checks?))\\b(?:' +
    '[.!…,;:\\s]*$' +
    '|\\s+(?:skipped|found|to report)\\b[.!…,;:\\s]*$' +
    `|\\s*[-—–]\\s*(?:stayed\\s+${BUDGET_QUALIFIED}\\b[.!…,;:\\s]*$` +
    '|(?:all|every(?:thing)?|planned|further|no further)\\b' +
    '(?:(?!\\b(?:but|except|excepting|excluding)\\b).)*' +
    '(?<!\\b(?:none|nothing|no|zero|never|not)\\s)' +
    `\\b(?:complete[ds]?|done|finished|covered)\\b${COMPLETION_TAIL}[.!…,;:\\s]*$)` +
    '|\\s*\\(\\s*(?:all|every(?:thing)?)\\b' +
    '(?:(?!\\b(?:but|except|excepting|excluding)\\b)[^()])*' +
    '(?<!\\b(?:none|nothing|no|zero|never|not)\\s)' +
    `\\b(?:complete[ds]?|done|finished|covered)\\b${COMPLETION_TAIL}[.!…,;:\\s]*\\)\\s*$` +
    '))', 'i');
/** Keep an operator-facing NOTE readable; a gap names a check, not an essay. */
const MAX_GAP_LENGTH = 160;
const MAX_GAPS_PER_AGENT = 8;
/**
 * Dangerous codepoints stripped from a gap before it can reach a terminal
 * or a posted body: C0 and C1 controls (U+009B is an 8-bit CSI), DEL, the
 * Unicode line separators (U+2028/29 — ECMAScript line terminators, which
 * would otherwise truncate silently downstream), and the bidi embedding /
 * override range U+202A-U+202E.
 */
const DANGEROUS_CHARS_RE = 
// eslint-disable-next-line no-control-regex
/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e]/g;
/** Markdown wrapper pairs stripped only SYMMETRICALLY — never one side. */
const WRAPPER_PAIRS = [
    ['**', '**'],
    ['__', '__'],
    ['*', '*'],
    ['_', '_'],
    ['~', '~'],
    ['`', '`'],
];
function stripWrappers(s) {
    let out = s;
    let changed = true;
    while (changed) {
        changed = false;
        for (const [open, close] of WRAPPER_PAIRS) {
            if (out.length > open.length + close.length &&
                out.startsWith(open) &&
                out.endsWith(close)) {
                out = out.slice(open.length, out.length - close.length).trim();
                changed = true;
            }
        }
    }
    return out;
}
// Both scripts' trailing punctuation: the fold key promises that a gap
// restated with and without a trailing stop discloses once, and a key that
// stripped only the ASCII set kept `渗透测试未进行。` and `渗透测试未进行` as
// two gaps — double-spending MAX_GAPS_PER_AGENT slots in exactly the
// output language the ZH branch exists for. The class mirrors ZH_TAIL's
// full stop set — including the fullwidth full stop ．(U+FF0E) beside 。
// (U+3002): the classifier treats both as trailing, and a fold key that
// dropped only one of them kept the double-spend open for the other.
const TRAILING_GAP_CHAR_RE = /[.!…,;:\s。，；：！？、．]/;
/** Trailing punctuation/whitespace strip for the normalize and fold keys. */
function stripTrailingGapChars(s) {
    // Walked backwards rather than replaced with an end-anchored class run:
    // that shape backtracks quadratically when a long run fails to reach
    // the end.
    let end = s.length;
    while (end > 0 && TRAILING_GAP_CHAR_RE.test(s.charAt(end - 1)))
        end--;
    return s.slice(0, end);
}
/** Truncate on code points — a slice through a surrogate pair is mojibake. */
function truncateGap(s) {
    const points = [...s];
    return points.length > MAX_GAP_LENGTH
        ? `${points.slice(0, MAX_GAP_LENGTH).join('')}…`
        : s;
}
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
export function budgetGapDisclosures(finalText) {
    if (!GAP_HINT_RE.test(finalText))
        return [];
    const gaps = [];
    const seen = new Set();
    let inFence = false;
    for (const line of finalText.split(/\r?\n/)) {
        if (/^[ \t]*(?:```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence)
            continue;
        // A blockquote is a quotation by definition; the agent is citing the
        // format (a brief, another agent's return), not using it.
        if (/^[ \t]*>/.test(line))
            continue;
        // Sanitized BEFORE matching: U+2028/29 are line terminators to the
        // regex dot, and a gap carrying one would otherwise fail the match and
        // vanish — silent loss in a channel whose promise is delivery. The
        // pre-trim keeps the greedy end-anchored capture's code-span
        // `endsWith` semantics on lines with trailing whitespace.
        const sanitized = line.replace(DANGEROUS_CHARS_RE, ' ').trimEnd();
        const m = BUDGET_GAP_LINE_RE.exec(sanitized);
        if (!m)
            continue;
        // A line written as a code span (`Budget gap: …`) is only taken when
        // the backtick closes — and then unwrapped with its partner, so a
        // symbol the gap itself names in backticks keeps both of its own.
        let raw = m[2] ?? '';
        if (m[1] === '`') {
            if (!raw.endsWith('`'))
                continue;
            raw = raw.slice(0, -1);
        }
        raw = stripWrappers(raw.trim()).trim();
        const normalized = stripTrailingGapChars(raw).trim();
        // Judged on the paren-stripped text, bare and wrapped alike, by the
        // one strict classifier — its doc names why the shapes are narrow.
        // Both paren shapes: under `outputLanguage: 中文` the full-width pair
        // （U+FF08/U+FF09）is what an IME produces, and a strip that knew only
        // the ASCII pair let `（无 — 所有检查均完成）` through as a phantom gap —
        // the #9094 incident shape this classifier exists to kill, surviving
        // in exactly the output language the ZH branch was added for. Only a
        // SYMMETRIC pair is unwrapped, so a mixed or unbalanced wrap stays
        // whole and errs toward disclosure. The inner text is trailing-stripped
        // exactly as the bare form already was (`normalized` above): the EN tail
        // classes are ASCII-only, so a wrapped `none。` kept its CJK tail and
        // survived as a phantom while its identical bare twin dropped — one
        // normalize, one judgment, bare and wrapped alike.
        const unparenthesized = stripTrailingGapChars((normalized.startsWith('(') && normalized.endsWith(')')) ||
            (normalized.startsWith('（') && normalized.endsWith('）'))
            ? normalized.slice(1, -1).trim()
            : normalized);
        if (normalized.length === 0 || PLACEHOLDER_GAP_RE.test(unparenthesized)) {
            continue;
        }
        // Folded on the same normalized text the classifier judged, so one gap
        // restated with and without parentheses — `(auth flow untested.)` and
        // `auth flow untested` — discloses once.
        const key = unparenthesized.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        gaps.push(truncateGap(raw));
        if (gaps.length >= MAX_GAPS_PER_AGENT)
            break;
    }
    return gaps;
}
/**
 * `finalText` with its budget-gap disclosure lines removed — what the
 * reverse-audit retirement judges a receipt on, so an agent's admission of
 * what it skipped can neither serve as the receipt's substance nor block a
 * receipt that is substantive without it.
 */
export function stripBudgetGapLines(finalText) {
    if (!GAP_HINT_RE.test(finalText))
        return finalText;
    const kept = [];
    let inFence = false;
    for (const line of finalText.split(/\r?\n/)) {
        const fence = /^[ \t]*(?:```|~~~)/.test(line);
        if (fence)
            inFence = !inFence;
        if (!fence &&
            !inFence &&
            !/^[ \t]*>/.test(line) &&
            BUDGET_GAP_LINE_RE.test(line)) {
            continue;
        }
        kept.push(line);
    }
    return kept.join('\n');
}
function sane(n) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}
//# sourceMappingURL=budget.js.map