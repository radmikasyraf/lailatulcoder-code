/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
export type ReviewEffort = 'low' | 'medium' | 'high';
/**
 * The posting floor for findings on a PR review: `critical` posts only
 * Critical findings (otherwise-postable high-confidence Suggestions are
 * recorded and deferred; low-confidence and Nice-to-have stay terminal-only
 * as ever), `suggestion` posts Criticals and Suggestions — today's behaviour. The floor governs what
 * the review PUBLISHES, never what it finds or verifies.
 */
export type ReviewSeverityFloor = 'critical' | 'suggestion';
export type ReviewTarget = {
    type: 'pr-number';
    number: number;
} | {
    type: 'pr-url';
    /** Canonicalized: lowercased scheme and host, query/fragment dropped. */
    url: string;
    host: string;
    owner: string;
    repo: string;
    /**
     * The FULL group path (`group/subgroup/project`) when the URL grammar
     * carries one — Aone nested-group repos. owner/repo collapse to the
     * last two segments, which is non-injective: identity gates
     * (match-remote, fetchDiff's origin guard) compare every segment when
     * both sides carry a path, so a same-named repo in a different group
     * can never pass as the target. Absent when the grammar holds exactly
     * two segments (GitHub).
     */
    groupPath?: string;
    number: number;
} | {
    type: 'file';
    path: string;
} | {
    type: 'local';
};
export interface ParsedReviewArgs {
    target: ReviewTarget;
    /** Resolved effort after defaults and the `--comment` override. */
    effort: ReviewEffort;
    effortSource: 'explicit' | 'configured' | 'default' | 'forced-by-comment' | 'forced-by-fix';
    comment: {
        /** `--comment` appeared in the arguments. */
        requested: boolean;
        /**
         * `--comment` applies (the target is a PR and it was requested — by the
         * flag, or by the standing `review.comment` setting).
         */
        effective: boolean;
    };
    /**
     * `--fix`: apply the confirmed findings to the working tree after reporting.
     *
     * Deliberately the mirror image of `--comment`, and gated on the opposite
     * targets. `--comment` writes to a pull request, so it needs a PR; `--fix`
     * writes to a **working tree**, so it needs one the user keeps. A PR review's
     * tree is the ephemeral worktree `fetch-pr` creates and Step 9 deletes — edits
     * there are discarded minutes later, and the one thing worse than not fixing
     * the findings is reporting that they were fixed into a directory that no
     * longer exists. So on a PR target `--fix` is ignored with a warning, exactly
     * as `--comment` is on a local one.
     */
    fix: {
        /** `--fix` appeared in the arguments. */
        requested: boolean;
        /** `--fix` applies (the target has a durable working tree). */
        effective: boolean;
    };
    /**
     * The posting floor, or `'auto'` — the round-adaptive default, resolved at
     * Step 6 where the round is known (`suggestion` through round 5, `critical`
     * from round 6). The parser cannot resolve `auto` itself: the round comes
     * from the previous posted round's ledger, which is not fetched yet. An
     * explicit `--severity-floor` on a non-PR target is ignored with a warning,
     * exactly as `--comment` is — the floor is a posting rule, and rounds exist
     * only for PRs.
     */
    severityFloor: ReviewSeverityFloor | 'auto';
    severityFloorSource: 'explicit' | 'configured' | 'default';
    /** The `--host` flag's value, when present — recorded verbatim so the
     *  write gate can bind a recorded bare-number target's platform (the
     *  target itself carries no host in that spelling). */
    host?: string;
    /**
     * `--resume`: continue an interrupted run of this same target instead of
     * starting over — Step 1 passes it to `fetch-pr --resume`, which rules on
     * the on-disk state itself and silently falls back to a fresh run when the
     * state no longer matches. Gated on PR targets: only `fetch-pr` has a
     * resume path (a local review's diff is captured from a live working tree
     * that has no stable interrupted state to continue). `effective` is a
     * TARGET-SHAPE gate, not a promise: a cross-repo `pr-url` with no matching
     * remote routes to lightweight mode, which never calls `fetch-pr` — the
     * parser cannot see remotes, so Step 1's lightweight branch owns telling
     * the user the flag is inert there.
     */
    resume: {
        /** `--resume` appeared in the arguments. */
        requested: boolean;
        /** `--resume` applies (the target is a PR). */
        effective: boolean;
    };
    /** Non-flag tokens beyond the first target token, reported not guessed. */
    extraTokens: string[];
    /** Unrecognized `--flags`, reported not guessed. */
    unknownFlags: string[];
    warnings: string[];
}
export declare const EFFORT_LEVELS: ReadonlySet<string>;
export declare const SEVERITY_FLOORS: ReadonlySet<string>;
export { tokenizeArgs } from '../../utils/shell-args.js';
export declare function parseReviewArgs(raw: string, defaults?: {
    /**
     * The standing default from `review.effort`, raw (`auto` already mapped
     * to undefined by the caller), applied when no `--effort` flag is
     * present. Validated case-insensitively exactly like an explicit flag —
     * an invalid value warns and falls back instead of dropping silently.
     * An explicit flag still wins; the `--comment`/`--fix` forcings still
     * override it.
     */
    effort?: string;
    /**
     * The standing `review.comment` setting: treat a PR review as if
     * `--comment` was passed. The target binding is untouched — the run still
     * authorises only the PR the arguments name.
     */
    comment?: boolean;
    /**
     * The standing `review.severityFloor` setting, raw (`auto` already mapped
     * to undefined by the caller). Validated exactly like the flag — a typo
     * warns and falls back to the round-adaptive default.
     */
    severityFloor?: string;
}): ParsedReviewArgs;
export declare const parseArgsCommand: CommandModule;
