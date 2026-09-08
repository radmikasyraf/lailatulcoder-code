/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
export interface RunReviewArgs {
    target?: string;
    effort?: string;
    comment: boolean;
    resume: boolean;
    json: boolean;
    failOn: 'none' | 'request-changes';
    timeoutMinutes: number;
    approvalMode: string;
    quiet: boolean;
}
export interface RunReviewResult {
    completed: boolean;
    event: string | null;
    verdictLine: string | null;
    baseEvent: string | null;
    cappedBy: string[];
    downgraded: boolean;
    downgradedFrom: string | null;
    remediation: string[];
    composedPath: string | null;
    /**
     * The exact `.qwen/tmp` filename this run's target class pins — named in
     * the result so a completed-but-uncaptured review (a naming drift between
     * this pin and the skill's template) is diagnosable after Step 9 has
     * swept the directory that would show the near-miss.
     */
    expectedComposedName: string;
    reportPath: string | null;
    childExitCode: number | null;
    childSignal: string | null;
    timedOut: boolean;
    durationMs: number;
}
/**
 * What a `review run` target IS, in the child's own terms. Classified by the
 * child's parser, not a local regex: the child names its artifacts after
 * what `parse-args` decided, so any second classifier here diverges exactly
 * where the shapes get interesting — `/pull/9014/files` (a PR to the parser,
 * unmatched by a $-anchored regex), `0042` (the parser writes `pr-42-`, a
 * verbatim pin looks for `pr-0042-`), `docs/pull/42` (a file path to the
 * parser). A run whose pin disagrees with the child reports a completed
 * review as "no verdict was produced".
 */
export type RunTargetClass = {
    kind: 'pr';
    number: string;
} | {
    kind: 'file';
    base: string;
} | {
    kind: 'local';
};
export declare function classifyRunTarget(target?: string): RunTargetClass;
/**
 * The one composed-verdict filename this run's target class produces, per
 * the skill's literal `--out .qwen/tmp/qwen-review-{target}-composed.json`
 * template: `pr-<n>` for a PR, the file's basename for a file review, the
 * fixed token `local` for a bare run. Exact names, not shape heuristics —
 * a name-shape pin (`(?!pr-\d+-)…`) rejected a file run's OWN artifact
 * whenever the reviewed file was named `pr-<digits>-…`, and conversely let
 * a PR pin claim that file run's artifact. Two concurrent `review run`s
 * share `.qwen/tmp`, and the pre-pin newest-composed scan captured the
 * OTHER run's verdict the moment it appeared (measured: two of three
 * parallel PR reviews republished a neighbour's `composedPath`).
 *
 * Known residual races, accepted — the pin separates composed FILENAMES,
 * which is as much identity as the child's naming carries; do not diagnose
 * any of these as a pin failure:
 *
 *  - same target twice (two bare runs, or the same PR twice) — the same
 *    filename, so whichever child composes last wins for both parents;
 *  - two FILE targets with different paths but one basename (a monorepo's
 *    two `index.ts`) — the child names by basename, so their filenames
 *    collide the same way;
 *  - a FILE target whose basename is literally `local` or `pr-<digits>` —
 *    its filename is byte-identical to the local/PR pin.
 *
 * Only a per-run nonce in the child's artifact names could key these
 * apart, and the bundled skill, not this command, would have to mint it.
 */
export declare function composedNameFor(cls: RunTargetClass): string;
export declare function composedPatternFor(cls: RunTargetClass): RegExp;
/**
 * The saved report under `.qwen/reviews/`, pinned as far as its naming
 * allows. PR reports reliably end `-pr-<n>.md`, and file reports carry the
 * filename in the same slot (`<date>-<time>-<filename>.md`, the `.md` not
 * doubled) — so a file target named `pr-1234.md` claims its OWN report
 * instead of tripping the local branch's PR exclusion. Local report stems
 * are model-chosen (three date formats observed in one day), so a bare run
 * claims any report EXCEPT a PR-suffixed one — concurrent local runs can
 * still pool reports, and a PR run cannot be told from a file run whose
 * basename is `pr-<n>.md` by name alone. The report is informational; the
 * verdict (`composedPatternFor`) is what carries the exit code, and it is
 * exact.
 */
export declare function reportPatternFor(cls: RunTargetClass): RegExp;
/** The /review invocation the child runs — built from flags, never hand-typed. */
export declare function buildReviewPrompt(args: {
    target?: string;
    effort?: string;
    comment?: boolean;
    resume?: boolean;
}): string;
/**
 * The newest file under `dir` matching `pattern` whose mtime is at or after
 * `startMs`, or null. Pre-existing artifacts from earlier reviews in the same
 * repo must not be mistaken for this run's verdict — a stale composed JSON says
 * whatever the LAST review decided, which is exactly the wrong thing to
 * republish — so anything older than the run is invisible here. The mtime
 * rides along with the path: the capture poll compares it against what it
 * already holds, and re-statting the path here would race the child's Step 9
 * sweep, which unlinks these files while the parent may still be polling.
 */
export declare function newestArtifactSince(dir: string, pattern: RegExp, startMs: number): {
    path: string;
    mtime: number;
} | null;
/**
 * Exit code contract: 0 = the review completed (whatever it decided); 1 = it
 * never reached a verdict (child failed, timed out with no verdict captured,
 * or left no composed artifact); 3 = it completed AND the caller asked
 * --fail-on request-changes AND the event is REQUEST_CHANGES. 3, not 2 — yargs
 * exits 1 on usage errors and some shells reserve 2, so a CI gate can tell
 * "review is blocking" from "the tool broke" without parsing anything.
 */
export declare function exitCodeFor(completed: boolean, event: string | null, failOn: 'none' | 'request-changes'): number;
/**
 * Terminate the child's process group — the detached relaunch wrapper AND the
 * real review it spawned. On POSIX a negative pid names the group; on Windows
 * there are no POSIX process groups and a negative pid is meaningless, so fall
 * back to `taskkill /T`, which walks the tree the detached child spawned. Both
 * are best-effort: killing a group that is already gone throws, and that is
 * fine.
 */
export declare function killProcessGroup(pid: number, signal: NodeJS.Signals): void;
export declare const runCommand: CommandModule;
