/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeStdoutLine, writeStderrLineSafe, } from '../../utils/stdioHelpers.js';
import { tokenizeArgs } from '../../utils/shell-args.js';
import { operatorReviewSettings } from './lib/review-settings.js';
import { bundleStalenessNotices } from './lib/stale-bundle.js';
import { isAoneHost } from './lib/platform/registry.js';
export const EFFORT_LEVELS = new Set([
    'low',
    'medium',
    'high',
]);
export const SEVERITY_FLOORS = new Set([
    'critical',
    'suggestion',
    // `auto` is a legal EXPLICIT value too — it is the schema-enumerated
    // default's name, so an operator typing `--severity-floor auto` means
    // "the round-adaptive rule" (overriding a configured floor), not a typo
    // to reject and then promote into a bogus file target.
    'auto',
]);
// The verdict's owner/repo/number are interpolated into `gh` commands by the
// caller, so they must be established trustworthily, not merely extracted:
// the scheme is case-insensitive, the number must END at the path segment
// (`/pull/42oops` is not PR 42), and owner/repo are restricted to GitHub's
// name charset — which as a side effect keeps shell metacharacters out of
// every derived value.
const PR_URL_RE = /^(https?):\/\/([A-Za-z0-9.-]+(?::\d+)?)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?=$|[/?#])/i;
// Aone Code CR URLs: `https://code.alibaba-inc.com/<group>[/subgroup…]/<project>/codereview/<global-id>`.
// The trailing number is the global MR id (what the Aone refspec and `a1 mr
// view` key on), carried as the target's `number` exactly like a GitHub PR
// number; when this host is passed on to the subcommands as `--host`, it
// decides the platform (the hint beats the cwd probe) — only WITHOUT a hint
// does detection fall back to the clone's origin remote.
// The group path may be nested (`group/subgroup/project`) — the repo identity
// keeps the last two segments, mirroring aone.parseRemoteUrl. Unlike
// `…/pull/<n>` (which any GHE host legitimately serves), the host is
// constrained to a REAL Aone subdomain: `(?:[A-Za-z0-9-]+\.)+alibaba-inc.com`
// requires a dot boundary, so lookalikes (`evilalibaba-inc.com`,
// `notalibaba-inc.com`) hit the fail-closed invalid-url refusal instead of
// becoming live targets — matching isAoneHost's dot-boundary semantics.
const AONE_CR_URL_RE = /^(https?):\/\/((?:[A-Za-z0-9-]+\.)+alibaba-inc\.com(?::\d+)?)\/((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+)\/codereview\/(\d+)(?=$|[/?#])/i;
/**
 * Case-insensitive: `--effort High` has exactly one plausible meaning, and
 * classifying `High` as a file-path target (as a case-sensitive match once
 * did) sends the caller off to stat a file that does not exist. The verdict
 * always carries the lowercase form.
 */
function asEffort(value) {
    const lower = value.toLowerCase();
    return EFFORT_LEVELS.has(lower) ? lower : null;
}
function asSeverityFloor(value) {
    const lower = value.toLowerCase();
    return SEVERITY_FLOORS.has(lower)
        ? lower
        : null;
}
/**
 * Single-dash tokens count as flags too: `-c` is never a plausible review
 * target, and classifying it as a file path demoted the real target the
 * user typed right after it into `extraTokens`.
 */
function isFlag(token) {
    return token.length > 1 && token.startsWith('-');
}
function isPureInteger(token) {
    return /^\d+$/.test(token);
}
/** A token that classifies as a PR target (number or PR URL). */
function isPrShapedToken(token) {
    const shape = classifyToken(token);
    return (shape !== null &&
        shape !== 'invalid-url' &&
        (shape.type === 'pr-number' || shape.type === 'pr-url'));
}
// tokenizeArgs lives in the CLI-level shared home (utils/shell-args.ts) so
// /audit consumes it without importing across command groups.
export { tokenizeArgs } from '../../utils/shell-args.js';
/**
 * `'invalid-url'` marks a token that looks like a URL but is not a valid PR
 * URL. It must not fall through to the `file` classification — a target the
 * user typed as a URL is never a file path, and guessing one would send the
 * caller off to stat a nonsense path instead of surfacing the typo.
 */
function classifyToken(token) {
    if (isFlag(token))
        return null;
    if (isPureInteger(token)) {
        return { type: 'pr-number', number: Number(token) };
    }
    const urlMatch = PR_URL_RE.exec(token);
    if (urlMatch) {
        const [, scheme, host, owner, repo, num] = urlMatch;
        const lowerHost = host.toLowerCase();
        // Aone serves no `/pull/` pages — a `/pull/<n>` URL on an Aone host is a
        // fabrication (the Aone CR grammar is `…/codereview/<id>`, keyed on the
        // global MR id). Refuse it fail-closed, mirroring the Aone-only
        // constraint on `/codereview/` (a non-Aone host there is refused too).
        if (isAoneHost(lowerHost))
            return 'invalid-url';
        return {
            type: 'pr-url',
            url: `${scheme.toLowerCase()}://${lowerHost}/${owner}/${repo}/pull/${Number(num)}`,
            host: lowerHost,
            owner,
            repo,
            number: Number(num),
        };
    }
    const aoneMatch = AONE_CR_URL_RE.exec(token);
    if (aoneMatch) {
        const [, scheme, host, groupPath, num] = aoneMatch;
        const lowerHost = host.toLowerCase();
        // Nested-group repos collapse to the last two segments (mirroring
        // aone.parseRemoteUrl), so `…/sub/maxcompute/odps_src/codereview/N`
        // yields owner `maxcompute`, repo `odps_src`.
        const segs = groupPath.split('/').filter(Boolean);
        const owner = segs[segs.length - 2];
        const repo = segs[segs.length - 1];
        return {
            type: 'pr-url',
            // The canonicalized URL keeps the FULL path — a collapsed spelling
            // would name a different (possibly nonexistent) repo to anything
            // that re-reads it.
            url: `${scheme.toLowerCase()}://${lowerHost}/${segs.join('/')}/codereview/${Number(num)}`,
            host: lowerHost,
            owner,
            repo,
            // Aone targets carry the FULL path — even two-segment ones: the
            // URL pins an exact repo, and the identity gates must compare it
            // against nested-group remotes in BOTH directions (a two-segment
            // target must not match a three-segment remote sharing its tail,
            // nor the reverse).
            groupPath: segs.join('/'),
            number: Number(num),
        };
    }
    if (/^https?:\/\//i.test(token))
        return 'invalid-url';
    return { type: 'file', path: token };
}
export function parseReviewArgs(raw, defaults = {}) {
    const tokens = tokenizeArgs(raw);
    const warnings = [];
    const unknownFlags = [];
    let commentRequestedByFlag = false;
    let fixRequested = false;
    let resumeRequested = false;
    let explicitEffort = null;
    let explicitFloor = null;
    let recordedHostFlag;
    // The configured default gets the same validation as an explicit flag:
    // settings loading performs no enum validation, so a hand-edited typo
    // reaches this far raw. Discarding it silently would run every review at
    // the built-in default while the operator believes another level is on —
    // the flag path warns on the identical typo, so this one does too.
    let configuredEffort;
    let invalidConfiguredEffort;
    if (defaults.effort !== undefined) {
        const normalized = asEffort(defaults.effort);
        if (normalized !== null) {
            configuredEffort = normalized;
        }
        else {
            invalidConfiguredEffort = defaults.effort;
        }
    }
    let configuredFloor;
    let invalidConfiguredFloor;
    if (defaults.severityFloor !== undefined) {
        const normalized = asSeverityFloor(defaults.severityFloor);
        if (normalized === 'auto') {
            // The default's own name: the same round-adaptive rule as an unset
            // setting. The settings caller pre-maps it, but a direct caller must
            // get identical semantics.
        }
        else if (normalized !== null) {
            configuredFloor = normalized;
        }
        else {
            invalidConfiguredFloor = defaults.severityFloor;
        }
    }
    const effortIssues = [];
    // `--severity-floor` shares the value-token grammar and therefore the same
    // deferred-warning problem; its issues are a separate list because its
    // resolution sentence is its own.
    const floorIssues = [];
    const kept = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token === '--comment') {
            commentRequestedByFlag = true;
            continue;
        }
        if (token === '--fix') {
            fixRequested = true;
            continue;
        }
        if (token === '--host' || token.startsWith('--host=')) {
            // Recorded verbatim for the write gate's platform binding; the value
            // is consumed either way and never leaks into the target tokens.
            if (token.includes('=')) {
                const value = token.slice(token.indexOf('=') + 1);
                if (value !== '')
                    recordedHostFlag = value;
                continue;
            }
            const next = i + 1 < tokens.length ? tokens[i + 1] : undefined;
            if (next !== undefined && next !== '' && !isFlag(next)) {
                recordedHostFlag = next;
                i++;
            }
            continue;
        }
        if (token === '--resume') {
            resumeRequested = true;
            continue;
        }
        if (token === '--effort' || token.startsWith('--effort=')) {
            if (token.includes('=')) {
                // `--effort=<value>`: self-contained; never consumes a second token.
                const value = token.slice(token.indexOf('=') + 1);
                const effortValue = asEffort(value);
                if (effortValue !== null) {
                    explicitEffort = effortValue;
                }
                else if (value !== '' && isPrShapedToken(value)) {
                    // A PR-shaped value in either flag syntax is the same typo of the
                    // same intent — it joins the disposal pool exactly as the spaced
                    // form does, so which codebase gets reviewed cannot depend on
                    // which syntax happened to be typed (round-8 review finding).
                    kept.push({ token: value, invalidValueOf: '--effort' });
                }
                else {
                    effortIssues.push({ kind: 'invalid-eq', value });
                }
                continue;
            }
            const next = i + 1 < tokens.length ? tokens[i + 1] : undefined;
            const nextEffort = next !== undefined ? asEffort(next) : null;
            if (nextEffort !== null) {
                explicitEffort = nextEffort;
                i++;
                continue;
            }
            // A quoted-empty value ('' survives tokenization) is a missing value,
            // not a candidate — and it is CONSUMED, or the leftover '' token would
            // classify as an empty-string file target.
            if (next === '') {
                effortIssues.push({ kind: 'missing' });
                i++;
                continue;
            }
            if (next === undefined || isFlag(next)) {
                // Flag-final, or followed by another flag: the value is simply
                // missing. Never consume a flag as a value.
                effortIssues.push({ kind: 'missing' });
                continue;
            }
            // Spaced form with an invalid non-flag value. Whether `next` is a
            // discarded typo or the review target is decided below, once we know
            // whether any other token can be the target.
            kept.push({ token: next, invalidValueOf: '--effort' });
            i++;
            continue;
        }
        if (token === '--severity-floor' || token.startsWith('--severity-floor=')) {
            if (token.includes('=')) {
                const value = token.slice(token.indexOf('=') + 1);
                const floorValue = asSeverityFloor(value);
                if (floorValue !== null) {
                    explicitFloor = floorValue;
                }
                else if (value !== '' && isPrShapedToken(value)) {
                    kept.push({ token: value, invalidValueOf: '--severity-floor' });
                }
                else {
                    floorIssues.push({ kind: 'invalid-eq', value });
                }
                continue;
            }
            const next = i + 1 < tokens.length ? tokens[i + 1] : undefined;
            const nextFloor = next !== undefined ? asSeverityFloor(next) : null;
            if (nextFloor !== null) {
                explicitFloor = nextFloor;
                i++;
                continue;
            }
            if (next === '') {
                floorIssues.push({ kind: 'missing' });
                i++;
                continue;
            }
            if (next === undefined || isFlag(next)) {
                floorIssues.push({ kind: 'missing' });
                continue;
            }
            kept.push({ token: next, invalidValueOf: '--severity-floor' });
            i++;
            continue;
        }
        if (isFlag(token)) {
            unknownFlags.push(token);
            warnings.push(`Unrecognized flag ${JSON.stringify(token)}; ignored.`);
            continue;
        }
        kept.push({ token });
    }
    // Disposal rule for invalid flag values, by what the token could BE:
    // - PR-shaped (a pure number, a PR URL) survives as a target candidate —
    //   `/review --effort 6711` is a user reviewing PR 6711 past a flag
    //   mistake, and an unrelated second typo (`--severity-floor blocker
    //   --effort 6711`) must not change WHICH codebase is reviewed.
    // - File-shaped survives only as the SOLE kept token (`/review
    //   --severity-floor criticl`): beside anything else, `blocker` is an
    //   enum typo, not a path — promoting it would send the caller off to
    //   stat nonsense, and two such typos are two typos, not a target and a
    //   tiebreak.
    // A token the user typed OUTSIDE any flag always outranks a flag value:
    // when one exists, every invalid value is a typo beside the real target.
    // And a PR-shaped rescue must be UNIQUE: two PR-shaped values arriving as
    // invalid flag values (`--severity-floor 6711 --effort 6712`) are an
    // ambiguous invocation — silently reviewing the first would review the
    // wrong PR half the time, so both are refused, loudly, and the review
    // falls back to the local diff nothing contradicted.
    const soleCandidate = kept.length === 1;
    const isPrShaped = isPrShapedToken;
    const isPrUrlToken = (token) => {
        const c = classifyToken(token);
        return c !== null && c !== 'invalid-url' && c.type === 'pr-url';
    };
    // The pool counts BOTH spellings: an `=`-form invalid value never enters
    // `kept` (it was recorded as `invalid-eq` and consumed in place), but it
    // is the same typed PR number — `--severity-floor=6711 --effort 6712`
    // must be exactly as ambiguous as the all-spaced spelling, or the guard
    // is defeated by which syntax happened to be typed.
    // Distinct TARGETS, not distinct strings: `--severity-floor 6711 --effort
    // https://github.com/o/r/pull/6711` are two spellings of one PR and are
    // unambiguous (round-9 finding: a raw-token Set read them as two and
    // silently fell back to the local tree — the very harm the guard exists
    // to prevent). The identity is the classified target's number plus, for
    // a URL, its host/owner/repo. Both flag syntaxes already landed in `kept`
    // above, so the pool sees every spelling.
    const targetKey = (token) => {
        const shape = classifyToken(token);
        if (shape === null || shape === 'invalid-url')
            return `raw:${token}`;
        if (shape.type === 'pr-number')
            return `pr:${shape.number}`;
        if (shape.type === 'pr-url')
            // The FULL group path, not the collapsed owner/repo: two nested-group
            // CR URLs that share their last two segments and the global id
            // (`groupA/sub/app` vs `groupB/sub/app`, same N) are DIFFERENT
            // targets and must not dedupe into one.
            return `pr:${shape.number}@${shape.host}/${shape.groupPath ?? `${shape.owner}/${shape.repo}`}`;
        return `raw:${token}`;
    };
    const prShapedKeys = [
        ...new Set(kept
            .filter((k) => k.invalidValueOf !== undefined && isPrShaped(k.token))
            .map((k) => targetKey(k.token))),
    ];
    // Distinct TARGETS. A bare number and a same-number URL name one PR when
    // no other repo is in play (the bare entry merges into the URL's key),
    // but two DIFFERENT repo-qualified keys with the same number name two
    // PRs — the number-only collapse once silently deduped them.
    const distinctPr = new Set();
    for (const k of prShapedKeys) {
        const bare = k.split('@')[0];
        if (k.includes('@')) {
            // Repo-qualified keys are distinct PRs; one subsumes a bare
            // same-number entry already in the set.
            if (distinctPr.has(bare))
                distinctPr.delete(bare);
            distinctPr.add(k);
        }
        else if (![...distinctPr].some((e) => e === bare || e.startsWith(`${bare}@`))) {
            distinctPr.add(k);
        }
    }
    // VALID CANDIDATES, with the mixed-shape restatement carved out: when the
    // rescue pool holds exactly one distinct PR and a URL spelling of it
    // arrived as an invalid flag value, a POSITIONAL bare number of the same
    // PR restates that PR — it is not a competing valid candidate. Letting it
    // rank as one discarded the URL (the sole carrier of host/platform
    // identity) and retargeted the run onto the cwd clone's same-number PR —
    // `--effort <cr-url> 7` reviewed (and could POST to) the wrong platform
    // (round-12 finding). A DIFFERENT number still outranks, as the user
    // typed it outside any flag.
    const poolKey = distinctPr.size === 1 ? [...distinctPr][0] : undefined;
    const poolPrNumber = poolKey !== undefined
        ? Number(poolKey.split('@')[0].replace(/^pr:/, ''))
        : undefined;
    const poolHasUrlSpelling = poolPrNumber !== undefined &&
        kept.some((k) => k.invalidValueOf !== undefined && isPrUrlToken(k.token));
    const hasValidCandidate = kept.some((k) => {
        if (k.invalidValueOf !== undefined)
            return false;
        if (poolHasUrlSpelling) {
            const c = classifyToken(k.token);
            if (c !== null &&
                c !== 'invalid-url' &&
                c.type === 'pr-number' &&
                c.number === poolPrNumber) {
                return false;
            }
        }
        return true;
    });
    if (!hasValidCandidate && distinctPr.size > 1) {
        const shown = kept
            .filter((k) => k.invalidValueOf !== undefined && isPrShaped(k.token))
            .map((k) => JSON.stringify(k.token));
        warnings.push(`Ambiguous target: ${shown.join(' and ')} arrived as invalid flag values and name different PRs; refusing to choose between them.`);
    }
    const targetTokens = [];
    // Of several spellings of the SAME rescued PR, exactly one becomes the
    // target; the rest are the same intent restated, not extra arguments —
    // pushing them all left the operator told "Ignoring extra argument(s)"
    // on the very invocation the dedupe blesses (round-9 finding).
    //
    // The repo-qualified URL spelling OUTRANKS the bare number as the
    // rescued target: it is the only carrier of host/platform identity. A
    // bare-number target flips detection onto the cwd fallback, and the run
    // silently reviews the cwd clone's same-number PR instead of the named
    // platform's — which spelling won depending on token order (round-10
    // finding: a loud refusal at the merge base degraded to a silent
    // wrong-platform retarget).
    const preferredRescueToken = !hasValidCandidate && distinctPr.size === 1
        ? kept.find((k) => k.invalidValueOf !== undefined && isPrUrlToken(k.token))?.token
        : undefined;
    let rescuedPr = false;
    for (const k of kept) {
        const issues = k.invalidValueOf === '--effort' ? effortIssues : floorIssues;
        if (k.invalidValueOf !== undefined) {
            const survives = isPrShaped(k.token)
                ? !hasValidCandidate && distinctPr.size === 1
                : soleCandidate;
            if (!survives) {
                issues.push({ kind: 'discarded', value: k.token });
                continue;
            }
            if (isPrShaped(k.token)) {
                if (rescuedPr)
                    continue; // same PR, restated — not an extra token
                // A bare number may not become the rescued target while the
                // same-PR URL spelling is present — the URL carries the identity.
                if (preferredRescueToken !== undefined &&
                    k.token !== preferredRescueToken &&
                    !isPrUrlToken(k.token)) {
                    continue;
                }
                rescuedPr = true;
            }
            issues.push({ kind: 'kept-as-target', value: k.token });
        }
        targetTokens.push(k.token);
    }
    // Same preference for positional spellings: when the target tokens hold
    // both a bare number and a same-number PR URL, the URL becomes the
    // target regardless of arrival order.
    const urlIdx = targetTokens.findIndex(isPrUrlToken);
    if (urlIdx > 0) {
        const [urlToken] = targetTokens.splice(urlIdx, 1);
        targetTokens.unshift(urlToken);
    }
    // Pick the first classifiable target token. A token that looks like a URL
    // but is not a valid PR URL is refused, not guessed at: it goes into
    // `extraTokens` with its own warning instead of becoming the target.
    let target = { type: 'local' };
    let targetAssigned = false;
    const extraTokens = [];
    const trailingExtras = [];
    for (const tok of targetTokens) {
        if (targetAssigned) {
            // A bare number restating the assigned URL target's number is the
            // same intent restated, not an extra argument (mirror of the
            // rescue loop's restatement handling).
            const classifiedRestate = classifyToken(tok);
            if (target.type === 'pr-url' &&
                classifiedRestate !== null &&
                classifiedRestate !== 'invalid-url' &&
                classifiedRestate.type === 'pr-number' &&
                classifiedRestate.number === target.number) {
                continue;
            }
            extraTokens.push(tok);
            trailingExtras.push(tok);
            continue;
        }
        const classified = classifyToken(tok);
        if (classified === 'invalid-url') {
            warnings.push(`Unrecognized URL ${JSON.stringify(tok)} — not a PR/CR URL (expected …/pull/<number> or …/codereview/<id>); refusing to guess a target from it.`);
            extraTokens.push(tok);
            continue;
        }
        target = classified ?? { type: 'local' };
        targetAssigned = true;
    }
    if (trailingExtras.length > 0) {
        warnings.push(`Ignoring extra argument(s): ${trailingExtras.map((t) => JSON.stringify(t)).join(', ')}.`);
    }
    const isPr = target.type === 'pr-number' || target.type === 'pr-url';
    const commentRequested = commentRequestedByFlag || defaults.comment === true;
    const commentEffective = commentRequested && isPr;
    if (commentRequestedByFlag && !isPr) {
        warnings.push('Warning: `--comment` flag is ignored because the review target is not a PR.');
    }
    const resumeEffective = resumeRequested && isPr;
    if (resumeRequested && !isPr) {
        warnings.push('Warning: `--resume` flag is ignored because the review target is not a PR — only a PR review has interrupted state to continue.');
    }
    // `--fix` edits a working tree, so it needs one that outlives the review. A
    // PR review's tree is the ephemeral worktree Step 9 removes; a `local` or
    // `file` review's tree is the user's own checkout.
    const fixEffective = fixRequested && !isPr;
    if (fixRequested && isPr) {
        warnings.push('Warning: `--fix` flag is ignored because a PR review runs in an ephemeral ' +
            'worktree that is deleted when the review ends — there is no durable tree to ' +
            'fix. Use `--comment` to publish the findings instead.');
    }
    let effort;
    let effortSource;
    if (explicitEffort !== null) {
        effort = explicitEffort;
        effortSource = 'explicit';
    }
    else if (configuredEffort !== undefined) {
        effort = configuredEffort;
        effortSource = 'configured';
    }
    else {
        effort = isPr ? 'high' : 'medium';
        effortSource = 'default';
    }
    // Posting requires a verified review: an *effective* --comment forces
    // high. An ignored --comment (non-PR target) must not change the effort.
    if (commentEffective && effort !== 'high') {
        effort = 'high';
        effortSource = 'forced-by-comment';
        warnings.push(commentRequestedByFlag
            ? '`--comment` requires a verified review; running at high effort.'
            : '`review.comment` is enabled in settings; posting requires a verified review — running at high effort.');
    }
    // Editing the user's files on the strength of an unverified finding is the
    // same mistake as posting one, aimed at their working tree instead of a pull
    // request — and low is unverified by construction (it runs no Step 4). So an
    // effective `--fix` floors the effort at medium, the cheapest tier whose
    // findings a verifier has ruled on. It does NOT force high: medium's findings
    // are verified, and the reverse audit high adds looks for findings that are
    // missing, which is not what deciding whether to apply one turns on.
    //
    // `--fix` and `--comment` cannot both be effective — they require opposite
    // target types — so these two blocks can never fight over the level.
    if (fixEffective && effort === 'low') {
        effort = 'medium';
        effortSource = 'forced-by-fix';
        warnings.push('`--fix` edits your working tree, so it requires verified findings; running at medium effort.');
    }
    // Now the resolution is final; compose the deferred effort warnings so
    // each states what is actually in effect.
    const resolution = effortSource === 'explicit'
        ? `--effort ${effort} (the last valid occurrence) is in effect`
        : effortSource === 'forced-by-comment'
            ? commentRequestedByFlag
                ? '`--comment` forces high effort'
                : 'the `review.comment` setting forces high effort'
            : effortSource === 'forced-by-fix'
                ? '`--fix` forces at least medium effort'
                : effortSource === 'configured'
                    ? 'using the configured review.effort'
                    : 'using the default effort';
    for (const issue of effortIssues) {
        switch (issue.kind) {
            case 'invalid-eq':
                warnings.push(`Invalid --effort value ${JSON.stringify(issue.value)}; ${resolution}.`);
                break;
            case 'missing':
                warnings.push(`--effort requires a value; ${resolution}.`);
                break;
            case 'discarded':
                warnings.push(`Invalid --effort value ${JSON.stringify(issue.value)} discarded; ${resolution}.`);
                break;
            case 'kept-as-target':
                warnings.push(`Invalid --effort value ${JSON.stringify(issue.value)}; treating it as the review target — ${resolution}.`);
                break;
            default:
                break;
        }
    }
    if (invalidConfiguredEffort !== undefined) {
        warnings.push(`Invalid review.effort value ${JSON.stringify(invalidConfiguredEffort)} in settings; ${resolution}.`);
    }
    // The floor resolves like the effort — explicit flag over configured
    // setting over the built-in default — except the default is `auto`: the
    // round-adaptive rule, which only Step 6 can resolve (the round comes from
    // the previous posted round's ledger, not fetched yet). Non-PR gating
    // mirrors `--comment`: the floor is a posting rule and rounds exist only
    // for PRs, so an explicit flag on a local/file target warns and is
    // ignored, and a configured setting is silently inert there.
    let severityFloor = 'auto';
    let severityFloorSource = 'default';
    if (explicitFloor !== null && !isPr) {
        warnings.push('Warning: `--severity-floor` flag is ignored because the review target is not a PR.');
    }
    else if (explicitFloor !== null) {
        severityFloor = explicitFloor;
        severityFloorSource = 'explicit';
    }
    else if (configuredFloor !== undefined && isPr) {
        severityFloor = configuredFloor;
        severityFloorSource = 'configured';
    }
    const floorResolution = severityFloorSource === 'explicit'
        ? `--severity-floor ${severityFloor} (the last valid occurrence) is in effect`
        : severityFloorSource === 'configured'
            ? 'using the configured review.severityFloor'
            : 'using the round-adaptive default';
    for (const issue of floorIssues) {
        switch (issue.kind) {
            case 'invalid-eq':
                warnings.push(`Invalid --severity-floor value ${JSON.stringify(issue.value)}; ${floorResolution}.`);
                break;
            case 'missing':
                warnings.push(`--severity-floor requires a value; ${floorResolution}.`);
                break;
            case 'discarded':
                warnings.push(`Invalid --severity-floor value ${JSON.stringify(issue.value)} discarded; ${floorResolution}.`);
                break;
            case 'kept-as-target':
                warnings.push(`Invalid --severity-floor value ${JSON.stringify(issue.value)}; treating it as the review target — ${floorResolution}.`);
                break;
            default:
                break;
        }
    }
    if (invalidConfiguredFloor !== undefined && isPr) {
        warnings.push(`Invalid review.severityFloor value ${JSON.stringify(invalidConfiguredFloor)} in settings; ${floorResolution}.`);
    }
    return {
        target,
        effort,
        effortSource,
        comment: { requested: commentRequestedByFlag, effective: commentEffective },
        fix: { requested: fixRequested, effective: fixEffective },
        severityFloor,
        severityFloorSource,
        ...(recordedHostFlag !== undefined ? { host: recordedHostFlag } : {}),
        resume: { requested: resumeRequested, effective: resumeEffective },
        extraTokens,
        unknownFlags,
        warnings,
    };
}
/**
 * The standing defaults from `settings.json` (`review.effort`,
 * `review.comment`), resolved for `parseReviewArgs`: `auto` effort — matched
 * case-insensitively, like every other value on this path — means the
 * built-in rule, so it maps to undefined. Any other value passes through
 * raw — `parseReviewArgs` validates it exactly like an explicit `--effort`
 * (case normalization included), so a typo warns instead of dropping
 * silently.
 */
function reviewDefaultsFromSettings() {
    const review = operatorReviewSettings();
    return {
        effort: review.effort === undefined || review.effort.toLowerCase() === 'auto'
            ? undefined
            : review.effort,
        comment: review.comment,
        severityFloor: review.severityFloor === undefined ||
            review.severityFloor.toLowerCase() === 'auto'
            ? undefined
            : review.severityFloor,
    };
}
export const parseArgsCommand = {
    command: 'parse-args [raw]',
    describe: 'Parse the /review skill argument string (--comment, --fix, --resume, --effort, --severity-floor, target disambiguation) and emit the verdict as JSON; pass the string on stdin via --stdin (a positional that begins with a dash never reaches this handler — yargs rejects it as an unknown flag)',
    builder: (yargs) => yargs
        .positional('raw', {
        type: 'string',
        describe: 'The raw argument string as a single (quoted) argument — only safe when it cannot begin with a dash or contain quotes; otherwise use --stdin',
    })
        .option('stdin', {
        type: 'boolean',
        describe: 'Read the raw argument string from stdin (one trailing newline is stripped). Immune to flag-first strings and shell quoting; this is the form the /review skill uses.',
    })
        .option('out', {
        type: 'string',
        describe: 'Also write the JSON verdict to this path',
    }),
    handler: (argv) => {
        const { raw, stdin, out } = argv;
        if (stdin && raw !== undefined) {
            throw new Error('parse-args: pass the raw string either as the positional argument or on --stdin, not both');
        }
        // Tokens after a `--` separator never bind to the [raw] positional —
        // they stay in argv._ — so `parse-args -- '--effort low'` used to
        // return a silently wrong local/default verdict. Refuse instead.
        // argv._ also carries the command path itself, whose shape depends on
        // nesting (`['parse-args']` standalone, `['review', 'parse-args']`
        // under the real CLI) — skip that prefix, or the guard rejects every
        // real nested invocation.
        const positionals = argv['_'].map(String);
        let commandPrefix = 0;
        while (commandPrefix < positionals.length &&
            (positionals[commandPrefix] === 'review' ||
                positionals[commandPrefix] === 'parse-args')) {
            commandPrefix++;
        }
        const unbound = positionals.slice(commandPrefix);
        if (unbound.length > 0) {
            throw new Error(`parse-args: unexpected extra argument(s) ${JSON.stringify(unbound)} — a raw string that begins with a flag must be passed via --stdin, not after --`);
        }
        const rawStr = stdin
            ? readFileSync(0, 'utf8').replace(/\r?\n$/, '')
            : (raw ?? '');
        // Before anything is parsed: every step after this one runs the BUILT
        // bundle, so a review command edited since that build does not take effect
        // and the run measures the old behaviour without saying so. This is the
        // first command of a fresh review; `drive` repeats the check, because
        // the verifier brief sends agents there without a step 1.
        const bundleNotice = bundleStalenessNotices(process.argv[1]);
        if (bundleNotice) {
            // `…Safe`, the convention for diagnostics in this subsystem: stderr
            // piped to `head` raises EPIPE, and a warning that kills the review it
            // is warning about would be worse than the staleness it reports.
            writeStderrLineSafe(bundleNotice);
        }
        const parsed = parseReviewArgs(rawStr, reviewDefaultsFromSettings());
        const json = JSON.stringify(parsed, null, 2);
        if (out) {
            mkdirSync(dirname(out), { recursive: true });
            writeFileSync(out, json, 'utf8');
        }
        writeStdoutLine(json);
    },
};
//# sourceMappingURL=parse-args.js.map