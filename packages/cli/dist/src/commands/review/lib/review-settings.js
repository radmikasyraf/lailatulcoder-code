/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { loadSettings } from '../../../config/settings.js';
import { writeStderrLineSafe } from '../../../utils/stdioHelpers.js';
/** What every field reads as when the settings cannot be loaded at all. */
const SAFE_DEFAULTS = {
    attribution: true,
    comment: false,
    effort: undefined,
    reverseAuditRounds: undefined,
};
/**
 * The `review.*` policy settings resolved from operator-controlled scopes
 * only (system defaults → user → system). The workspace scope is excluded
 * because `.lailatulcoder/settings.json` is repository-controlled content that the
 * review reads: a repository must not decide, for every reviewer who opens
 * it, whether findings publish (`comment`), whether the posted review names
 * its model (`attribution`), or how deeply the pipeline verifies (`effort`).
 */
export function operatorReviewSettings() {
    // `loadSettings` throws a FatalConfigError when a settings file cannot be
    // READ (or its migration fails) — malformed JSON does not reach that path,
    // it is copied aside and recovered ("Never crash due to a corrupted settings
    // file"). An unreadable file is enough: this is read while a plan is being
    // captured, the review's first step, so the throw would end the whole review
    // over a permissions bit on a file none of these settings had to come from.
    // Degrade to the defaults instead and say so. Most of them are the
    // conservative side outright — attribution on, no auto-posting, no round
    // ceiling — so a review that loses those loses them toward doing more work
    // and writing nothing public. `effort` is the honest exception: dropping an
    // operator's `high` returns the built-in rule, which is medium on a local
    // target, so that one field can degrade to LESS work. It is disclosed on
    // stderr for exactly that reason rather than being silently absorbed.
    let review;
    try {
        review = loadSettings(undefined, { skipWorkspaceSettings: true }).merged
            .review;
    }
    catch (error) {
        // The SAFE writer, not the throwing one. `process.stderr.write` throws on
        // EPIPE or a closed fd, and this NOTE is incidental to the degrade — a
        // throw here would propagate out of the catch and end the review by the
        // very path added to stop a broken settings file from ending it.
        writeStderrLineSafe(`NOTE: review settings could not be loaded (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); this review uses the defaults — attribution on, no auto-posting, no ` +
            `effort or round-cap override. Fix the settings file to restore them.`);
        return { ...SAFE_DEFAULTS };
    }
    // Settings loading performs no per-value type validation — the inferred
    // `boolean` types do not hold for hand-edited files (`"false"` as a quoted
    // string is the classic mistake), so each value is re-checked here. A
    // non-boolean `attribution` falls back to the schema default (on); a
    // non-boolean `comment` never enables auto-posting.
    const rounds = review?.reverseAuditRounds;
    return {
        attribution: typeof review?.attribution === 'boolean' ? review.attribution : true,
        comment: review?.comment === true,
        effort: typeof review?.effort === 'string' ? review.effort : undefined,
        severityFloor: typeof review?.severityFloor === 'string'
            ? review.severityFloor
            : undefined,
        reverseAuditRounds: typeof rounds === 'number' && Number.isInteger(rounds) && rounds > 0
            ? rounds
            : undefined,
    };
}
//# sourceMappingURL=review-settings.js.map