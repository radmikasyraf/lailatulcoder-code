/**
 * Whether a filename under `REVIEW_TMP_DIR` is a review-worktree lease.
 * Derived from `validTarget` so the writer, `cleanup`'s sweep guard, and the
 * `cleanupReviewWorktreeLeases` scan share one definition of the lease shape
 * (see the `LEASE_PREFIX` comment in `lib/paths.ts`).
 */
export declare function isReviewLeaseFile(fileName: string): boolean;
export interface ReviewWorktreeLease {
    sessionId: string;
    promptId: string;
    target: string;
    repositoryRoot: string;
    worktreePath: string;
    branch: string;
}
/** Absolute path of the lease file recording who holds a review target. */
export declare function reviewLeasePath(repositoryRoot: string, target: string): string;
export declare function clearReviewWorktreeLease(repositoryRoot: string, target: string): void;
/**
 * Remove the lease only when the caller wrote it. fetch-pr's failure-path
 * rollback must never erase a lease another session acquired DURING the run —
 * the documented manual-recovery shape: an operator deletes a stuck run's
 * lease, a new session acquires, then the stuck run un-sticks, fails, and
 * would blind-delete the new holder's lock.
 */
export declare function clearReviewWorktreeLeaseIfOwned(repositoryRoot: string, target: string, owner: {
    sessionId: string;
    promptId: string;
}): void;
export declare function createReviewWorktreeLease(params: {
    sessionId: string | undefined;
    promptId: string | undefined;
    target: string;
    repositoryRoot: string;
    worktreePath: string;
    branch: string;
}): void;
/** The lease currently registered for a review target, or null. */
export declare function readReviewWorktreeLease(repositoryRoot: string, target: string): ReviewWorktreeLease | null;
/**
 * Whether a lease blocks THIS process from taking the target over.
 *
 * The review worktree path is fixed per PR number, so two reviews of the same
 * PR run on top of each other: whichever runs `fetch-pr`'s stale-clean or
 * `cleanup` next removes the other's worktree, branch, and side files mid-run
 * (#9205). The lease doubles as the lock against that — holders compare by
 * SESSION, not prompt: one session reviews a PR across several prompts
 * (rounds, drift restarts), and a later prompt of the same session must be
 * able to re-take what its own earlier prompt leased. A process with no
 * session id cannot prove ownership of anything, so any existing lease blocks
 * it — a bare-terminal `cleanup` must not delete a live session's state.
 */
export declare function reviewLeaseHeldByAnotherSession(lease: ReviewWorktreeLease | null): lease is ReviewWorktreeLease;
export declare function cleanupReviewWorktreeLeases(params: {
    sessionId: string;
    promptId: string;
    repositoryRoot: string;
    gitTimeout?: number;
}): void;
