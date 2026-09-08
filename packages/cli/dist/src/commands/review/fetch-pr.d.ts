/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import type { IncrementalScope } from './lib/incremental-scope.js';
export interface IncrementalDecision {
    since: string;
    effective: boolean;
    upToDate?: boolean;
    reason?: 'unknown-commit' | 'not-an-ancestor' | 'behind-merge-base' | 'nothing-to-narrow' | 'cross-model-anchor' | 'base-untrusted' | 'capture-failed' | 'partition-failed';
    /**
     * The left side of the range the published scope was assembled from, as a
     * FULL sha, present exactly when the report's diff is the narrowed scope
     * (`effective` and not `upToDate`). Downstream consumers that recompute
     * their own ranges read it — Agent 7's test-efficacy probe welds `--base`
     * into its brief. It is the merge base, never the anchor: the published
     * hunks are byte-identical hunks of `mergeBase..head`, so that range
     * covers every one of them and never a byte the PR's diff does not
     * display, while the anchor range can carry hunks an undo round netted
     * out of the PR's diff.
     */
    diffBase?: string;
    /**
     * Which files the published scope holds and why, present exactly when the
     * scope is the narrowed one. `deltaFiles` are what the round touched;
     * `interaction[]` are still-clean files the one-hop widening pulled back
     * in, each with the edges that did it, so a chunk brief can point its agent
     * at the seam rather than order a from-scratch re-review.
     */
    scope?: IncrementalScope;
}
/** The git questions the anchor ruling asks, injectable for tests. */
export interface AnchorProbe {
    /**
     * `git cat-file -e <sha>` — does this history hold that object? Bare, with
     * no `^{commit}` peel: peeling makes git answer 128 for a well-formed but
     * unknown sha, which is indistinguishable from the surface failing.
     * Commit-ness is `resolveCommit`'s job.
     */
    commitExists(sha: string): boolean;
    /** `git merge-base --is-ancestor <a> <b>` — is it behind the fetched head? */
    isAncestor(a: string, b: string): boolean;
    /** `git rev-parse <sha>^{commit}` — the full sha, for the head comparison. */
    resolveCommit(sha: string): string | null;
}
/**
 * Rule on an incremental anchor against the fetched history. Pure — the
 * probe is the git surface — because the SKILL used to ask the orchestrator
 * to run these exact checks by hand, and a hand-run check is one a run can
 * skip. The hex allowlist comes first so an anchor recovered from a marker
 * or cache is never handed to git as something flag-shaped.
 *
 * `diffBase` is the full sha to scope the diff from, null when the diff must
 * stay full-range (anchor refused, or already at the head).
 *
 * `mergeBase`'s `sha`, when one was resolved, is the clamp: an anchor that is
 * an ancestor of the head but OLDER than the merge base would scope a range
 * strictly
 * WIDER than the PR's own diff (`anchor..head` = the PR plus a slice of base
 * history) — re-reviewing already-landed hunks whose comments fall outside
 * every hunk of GitHub's PR diff, where a single one 422s the whole Create
 * Review call. Reachable non-adversarially: commits from the PR branch
 * landing in the base between rounds move the merge base past the cached
 * anchor. A null `sha` skips the clamp, consistent with the capture path's
 * base-free design — but a `fetchFailed` base that DID resolve a sha refuses
 * the anchor: the clamp would then be ruling on a base resolved from a
 * possibly stale local ref, and every sibling guard here (`isEmptyDiff`,
 * `isCollapsedFromUpstream`) declines to rule in that state rather than
 * ruling on it. `{fetchFailed: true, sha: null}` is not that state — there
 * is no clamp to rule at all, and the delta range needs no base.
 *
 * `noAncestry` is the AGit-Flow rule (Aone; design D7). Under AGit-Flow,
 * updating a CR AMENDS the single commit in place: the amended H2 has H1's
 * parent, never H1 itself, so the old head is orphaned and the
 * anchor-behind-head test fails for EVERY update — the amended head never
 * descends from the cached one. (The clamp additionally fails whenever the
 * update also rebased onto newer master, since the merge base then moves
 * past the cached head; a pure amend passes it.) Neither is asked: after
 * the fetch both heads are local, so `anchor..head` IS the update's delta
 * (for a pure amend, exactly the amended lines; if the author also rebased
 * onto newer master, the range additionally carries the rebase drift; the
 * narrowing join reads it only for which files changed and never lets a
 * drift byte reach the published scope, falling back to the full range via
 * `nothing-to-narrow` when the drift touched files outside the CR's diff).
 * The published scope is still assembled
 * from the PR's own diff by the narrowing step, so it cannot carry a hunk
 * the platform does not display, and the `base-untrusted` refusal stays —
 * it guards a capture against a stale base, not a lineage. The existence
 * checks also stay: an anchor the object store does not hold (a fresh
 * clone) cannot be diffed against.
 */
export declare function resolveIncrementalAnchor(rawSince: string, fetchedSha: string, probe: AnchorProbe, mergeBase?: {
    sha: string | null;
    fetchFailed: boolean;
} | null, options?: {
    noAncestry?: boolean;
}): {
    incremental: IncrementalDecision;
    diffBase: string | null;
};
/**
 * Whether the capture found nothing to review.
 *
 * Extracted and pure because the SKILL ACTS on it — it recommends the PR be
 * closed as superseded — which makes it the one disclosure here that is
 * expensive to get wrong, and it was the one with no test. Both guards are
 * load-bearing and neither is about the diff: a capture that THREW also leaves
 * `diffText` empty (`diffPath` is set only on success), and a merge base
 * resolved from a stale local ref can already contain the head commits and so
 * diff to empty. Either would close a live PR on an infrastructure error.
 */
export declare function isEmptyDiff(i: {
    diffPath: string | null;
    baseFetchFailed: boolean;
    diffText: string;
}): boolean;
/**
 * Whether the recomputed diff has collapsed against GitHub's advertised stat —
 * the rebase-lag signature.
 *
 * Both thresholds are coarse on purpose, and the reason is that the two sides
 * are produced by DIFFERENT tools: `--find-renames` is pinned locally while
 * GitHub applies its own, so a move whose similarity lands on opposite sides of
 * the two thresholds shrinks one side and not the other. The 4x is what buys
 * past that — a threshold disagreement moves the ratio by one file, a genuine
 * upstream collapse moves it by the size of the PR — and the 200-line floor
 * keeps small PRs, where one file IS the ratio, out of it entirely. A
 * disclosure, never a gate, precisely because it is not the same quantity
 * measured twice.
 */
export declare function isCollapsedFromUpstream(i: {
    diffText: string;
    baseFetchFailed: boolean;
    additions: number;
    deletions: number;
}): boolean;
/**
 * Changed (+/-) lines in a unified diff — headers excluded. Delegates to the
 * single hunk-state walker in computeDiffStats so the two can never disagree
 * (isCollapsedFromUpstream compares this against the advertised stats, and
 * for Aone the advertised stats COME from computeDiffStats — one walker, or
 * the ratio is load-bearing on two copies agreeing).
 *
 * POSITION, not prefix shape. Guessing by prefix (`^-(?!--)`) has to exclude
 * every line starting `--`, and a DELETED line whose own content starts `--`
 * arrives as `--- …`: markdown rules and YAML document markers, SQL and Lua
 * comments, a `--flag` in a script. Each one silently dropped a real changed
 * line, and every drop pushes the ratio toward a false `collapsedFromUpstream`
 * (the disclosure fires when the recomputed count comes in LOW).
 */
export declare function countDiffChangedLines(diffText: string): number;
/**
 * Additions / deletions / changed-files counted straight off a unified diff —
 * the single hunk-state walker (see countDiffChangedLines). Used when the
 * platform does not advertise diff stats (Aone); GitHub's `gh pr view`
 * reports them, so GitHub keeps the advertised numbers. Inside a hunk the
 * position is unambiguous — `---`/`+++` cannot be file headers there — so
 * track hunk state and count every `+`/`-` line in it; `diff --git` opens
 * the next file's header block and `\ No newline at end of file` is a marker,
 * not content.
 */
export declare function computeDiffStats(diffText: string): {
    additions: number;
    deletions: number;
    changedFiles: number;
};
export declare const fetchPrCommand: CommandModule;
