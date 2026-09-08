/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface OperatorReviewSettings {
    attribution: boolean;
    comment: boolean;
    /**
     * The raw `review.effort` value when set — still `'auto'`, and settings
     * loading performs no per-value enum validation, so possibly not a level
     * at all. Callers normalize.
     */
    effort?: string;
    /** The raw `review.severityFloor` value when set — same caveats as effort. */
    severityFloor?: string;
    /**
     * The operator's reverse-audit round ceiling, when they set a real one.
     *
     * Only a positive integer survives; `0` (the schema default, meaning "not
     * set"), a fraction, a negative, a string and a `NaN` all read as absent,
     * because the difference between "the operator chose a number" and "the
     * operator chose nothing" is the whole meaning of this field — a garbled
     * value that fell through as `0` would otherwise read as a request for a
     * zero-round audit.
     *
     * Whether the number is *usable* is not decided here: this module reports
     * what the operator asked for, and `reviewBudget` decides what the plan's
     * topology can honour (it may only lower a tier, never raise it).
     */
    reverseAuditRounds?: number;
}
/**
 * The `review.*` policy settings resolved from operator-controlled scopes
 * only (system defaults → user → system). The workspace scope is excluded
 * because `.qwen/settings.json` is repository-controlled content that the
 * review reads: a repository must not decide, for every reviewer who opens
 * it, whether findings publish (`comment`), whether the posted review names
 * its model (`attribution`), or how deeply the pipeline verifies (`effort`).
 */
export declare function operatorReviewSettings(): OperatorReviewSettings;
