/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import type { ComposeReviewResult } from './compose-review.js';
import { type FindingsReport } from '../../utils/findings.js';
import { type ReviewEffort } from './parse-args.js';
interface PersistedVerdict extends Omit<ComposeReviewResult, 'postedInline' | 'postedFresh' | 'prevPostedInline'> {
    verdictLine: string;
    /**
     * Optional HERE, required on the composed result it is otherwise a copy
     * of: a live compose always knows how many comments the round posts, but
     * an artifact read back from disk may have been written before the field
     * existed. Absence is preserved rather than defaulted — see the validator.
     *
     * `prevPostedInline` is omitted from this type entirely rather than
     * inherited: the validator neither reads nor writes it, so carrying it
     * here would advertise a field no artifact contains and license a
     * consumer into an always-undefined branch. The two-round window stays
     * recoverable from the marker chain inside `body`.
     */
    postedInline?: number;
    /**
     * Optional for the same reason as its sibling, and for one more: an
     * artifact written before the convergence trend measured NEW findings
     * carries only the total. Absence is preserved rather than defaulted —
     * a round that recorded no fresh count is not a round that produced none.
     */
    postedFresh?: number;
}
export interface ReviewArtifactV1 {
    schemaVersion: 1;
    target: string;
    effort: ReviewEffort;
    verdict: PersistedVerdict;
    findings: FindingsReport['findings'];
    counts: FindingsReport['counts'];
    outcomesRecorded: boolean;
    markdownReportPath: string;
}
export interface SavedReviewArtifact {
    /** Absolute path of the written document. */
    path: string;
    /**
     * The same path relative to the workspace root. `record_artifact` now
     * accepts the absolute `path` and stores this canonical form itself;
     * keep emitting it so older runtimes and display surfaces can still
     * use the root-relative locator.
     */
    workspacePath: string;
}
interface SaveArtifactArgs {
    findings: string;
    composed: string;
    report: string;
    target: string;
    effort: ReviewEffort;
    out: string;
    workspaceRoot?: string;
}
export declare function saveReviewArtifact(args: SaveArtifactArgs): SavedReviewArtifact;
export declare const saveArtifactCommand: CommandModule;
export {};
