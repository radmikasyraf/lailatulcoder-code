/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** Why a resume was refused. Stable identifiers: the report carries one. */
export type ResumeRefusal = 'no-report' | 'pr-mismatch' | 'effort-mismatch' | 'no-diff-hash' | 'worktree-gone' | 'worktree-sha-mismatch' | 'worktree-dirty' | 'diff-unreadable' | 'diff-hash-mismatch' | 'head-moved' | 'resume-cap';
export type ResumeAssessment = {
    ok: true;
} | {
    ok: false;
    reason: ResumeRefusal;
};
/** What the previous fetch report claims. All fields as parsed, unvalidated. */
export interface PreviousReport {
    prNumber?: unknown;
    fetchedSha?: unknown;
    diffSha256?: unknown;
    effort?: unknown;
}
/** What the world looks like now, probed by the caller. */
export interface ResumeProbes {
    /** The PR number this invocation was asked to review. */
    prNumber: string;
    /** `git -C <worktree> rev-parse HEAD`, or null when the worktree is gone. */
    worktreeHeadSha: string | null;
    /**
     * `git status --porcelain` on the worktree reported no changes. A tree at
     * the right HEAD can still hold uncommitted edits — this pipeline's own
     * build/test agents mutate worktrees by design, and a death between an
     * apply and its revert leaves exactly that. Resuming there would review
     * code that is not in the PR. Null when the probe could not run, treated
     * as dirty.
     */
    worktreeClean: boolean | null;
    /** sha256 of the diff file's bytes on disk, or null when unreadable. */
    diffSha256OnDisk: string | null;
    /** The PR's live head OID from the forge, or null when unavailable. */
    liveHeadSha: string | null;
    /** How many times this review has already resumed. */
    resumeCount: number;
    /**
     * The --effort this invocation was called with, or null. An EXPLICIT
     * effort different from the recorded run's is a request for different
     * work, not a continuation; absent effort keeps the recorded level.
     */
    requestedEffort: string | null;
}
/**
 * The ruling. Checks are ordered from "there is nothing to resume" through
 * "the state is not the state that was left" to "resuming is not allowed
 * again" — so the reported reason names the FIRST fact that broke the chain.
 */
export declare function assessResume(prev: PreviousReport | null, probes: ResumeProbes): ResumeAssessment;
