/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
/**
 * Hard cap on resumes of one review. The workflow's own retry loop allows a
 * single retry (MAX_ATTEMPTS=2), so 2 leaves headroom for a manual rerun
 * without permitting an unbounded resume chain on a review that keeps dying.
 */
export declare const RESUME_MAX = 2;
/**
 * The plan mtime an entry was written against — the EXACT fresh-run boundary.
 *
 * The epoch window alone is inexact by its own slack: a previous run that
 * appended within the slack of this run's plan write survives it, and one of
 * its late transcripts would then be credited here. An entry carries the
 * mtime it saw, and a reader keeps only entries that saw THIS plan — which a
 * fresh run necessarily rewrote and a resumed run deliberately did not.
 * Entries without the field never exist in the wild — it shipped in the same
 * change as the ledger itself — so there is no fallback: an entry that cannot
 * say which plan it saw is dropped. (An earlier revision degraded to the
 * window instead; the fallback was removed as unsound and this paragraph
 * outlived it by one round.)
 *
 * Compared within `PLAN_MTIME_TOLERANCE_MS`, not exactly: the mtime survives a
 * `utimesSync` round trip on every content-changing enrichment, and that round
 * trip costs a unit in the last place. See that constant.
 */
/**
 * The one indirection the fault-injection probes need. `node:fs` arrives as
 * a sealed ESM namespace under the test runner, so a transient EMFILE/EPERM
 * — the fault class the single-read design exists to survive — cannot be
 * injected by mocking the module. Same idea as `contained-read`'s injectable
 * read seam; production code never reassigns these.
 */
export declare const ledgerIoForTests: {
    readFileSync: typeof readFileSync;
    statSync: import("fs").StatSyncFn;
};
/** Where the session ledger lives — derived from the plan path, never passed. */
export declare function runSessionsPath(planPath: string): string;
/**
 * Record the current session against this plan. Id comes from the environment
 * the CLI itself exported, never from an argument. Write errors are swallowed
 * for the same reason `stampRound` swallows them — a read-only tmp dir must
 * not stop a review being built; it only costs a later resume its evidence.
 */
export declare function appendRunSession(planPath: string, env?: NodeJS.ProcessEnv, nowMs?: number): void;
/**
 * How many sessions this run's ledger records — a COUNT, ungated.
 *
 * The authorization gate on `priorSessionEntries` protects EVIDENCE: it stops
 * a session that was never granted a resume from reading another attempt's
 * transcripts. A count is not evidence. It says how many times this review has
 * been picked up, which is exactly what a cap needs and reveals nothing about
 * what any attempt did.
 *
 * The distinction matters because the cap read both terms through the gate,
 * and the gate cannot be satisfied at ruling time: a session is recorded as an
 * authorized resume only AFTER its ruling passes, so the ledger term was
 * structurally zero for every ruling. Deleting `resume.json` then reset the
 * cap that the ledger was supposed to backstop — the one attack the two-counter
 * design existed to defeat.
 */
export declare function sessionEntryCount(planPath: string, opts?: {
    /**
     * Exclude the session this id names (folded on the path key). The resume
     * cap counts OTHER attempts: a same-session retry of the last permitted
     * resume is that same resume, and counting the session's own entry in
     * either term refuses the retry — whose fresh fall-through then destroys
     * the very state being resumed.
     */
    excludeSessionId?: string;
}): number;
/**
 * How many RESUMES this run's ledger records — the entries PAST the first.
 * The ledger's first entry is the original run's own session, which is not
 * a resume. `excludeSessionId` removes the resuming session's own entry
 * from that remainder — and when the resuming session IS the original, the
 * exclusion has already removed the first entry, so the original must not
 * be subtracted AGAIN: the double subtraction undercounted the cap by one
 * and admitted a resume past the cap through the exact backstop path
 * (deleted marker, original session resuming) this term exists to hold.
 */
export declare function ledgerResumeCount(planPath: string, opts?: {
    excludeSessionId?: string;
}): number;
/**
 * Session ids of EARLIER attempts of this same run — the current session
 * excluded, order preserved, deduplicated by the ledger's own append guard.
 * These are addresses for `subagents/<id>` lookups, nothing more.
 */
export declare function priorSessionIds(planPath: string, env?: NodeJS.ProcessEnv): string[];
/**
 * This session's own ledger entry, if it wrote one.
 *
 * Needed for the cost floor: a review that starts inside an EXISTING CLI
 * session must not bill that session's earlier, unrelated turns, and the
 * plan floor alone cannot tell them apart. No authorization gate here — a
 * session reading its own entry is not reading anyone else's evidence.
 */
export declare function currentSessionEntry(planPath: string, env?: NodeJS.ProcessEnv): {
    sessionId: string;
    atMs: number;
} | null;
/**
 * The same prior sessions, with the timestamps that bound them.
 *
 * `endsAtMs` is the NEXT ledger entry's `atMs` — the moment the following
 * attempt started, which is the only end boundary this run records. The cost
 * ledger clamps a prior session's chat usage to it: an interrupted session
 * whose CLI kept being used for unrelated turns afterwards would otherwise
 * bill that activity as review cost, the mirror of the omission the ledger
 * exists to prevent. `null` only when this session has no ledger entry of
 * its own to close the last prior's window with — in the normal flow
 * `fetch-pr` appends unconditionally, so the newest prior is clamped to
 * THIS session's start.
 */
export declare function priorSessionEntries(planPath: string, env?: NodeJS.ProcessEnv): Array<{
    sessionId: string;
    atMs: number;
    endsAtMs: number | null;
}>;
/** Resume/restart bookkeeping for one review run. */
export interface ResumeMarker {
    schemaVersion: 1;
    /** Each successful `--resume` continuation, in order. */
    resumes: Array<{
        sessionId: string;
        atMs: number;
        planMtimeMs?: number;
    }>;
    /** Each restart-for-head-movement, in order. The skill's cap is one. */
    restarts: Array<{
        atMs: number;
        reason: string;
        planMtimeMs?: number;
    }>;
}
/** Where the resume marker lives — derived from the plan path, never passed. */
export declare function resumeMarkerPath(planPath: string): string;
/**
 * The marker, epoch-fenced like the session ledger: entries from a previous
 * review of the same PR are dropped, so a fresh run always starts at zero
 * resumes and zero restarts. Malformed → the empty marker (fail toward "no
 * history", which the caps then treat most permissively — the hard bound on
 * abuse is the session ledger's entry count and the workflow's MAX_ATTEMPTS).
 */
export declare function readResumeMarker(planPath: string): ResumeMarker;
/**
 * Record a successful `--resume` continuation under the current session.
 * One entry per session, like the session ledger's own guard: a session
 * resumes a run at most once, so a repeated call is a caller-side retry and
 * must not spend the resume cap twice.
 */
export declare function recordResume(planPath: string, env?: NodeJS.ProcessEnv, nowMs?: number): void;
/**
 * Record a restart-for-head-movement (the skill's once-per-review event).
 * Deduplicated by reason: the event is at-most-once by rule, so a repeated
 * identical call is a caller-side retry, not a second restart.
 */
export declare function recordRestart(planPath: string, reason: string, nowMs?: number): void;
