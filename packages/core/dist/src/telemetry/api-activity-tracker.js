/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
class ApiActivityTracker {
    #errors = 0;
    #retries = 0;
    /** Fold in one model API error (called from `logApiError`). */
    recordError() {
        this.#errors += 1;
    }
    /** Fold in one automatic retry (called from `logApiRetry`). */
    recordRetry() {
        this.#retries += 1;
    }
    /**
     * Return the counts accumulated since the last drain and reset them to zero.
     * The read+reset is synchronous (no `await` between), so a `recordError` /
     * `recordRetry` racing an in-progress drain can never be lost — it simply
     * lands in the next window.
     */
    drain() {
        const counts = {
            errors: this.#errors,
            retries: this.#retries,
        };
        this.#errors = 0;
        this.#retries = 0;
        return counts;
    }
    /** Peek at the pending counts without draining (tests / diagnostics). */
    peek() {
        return { errors: this.#errors, retries: this.#retries };
    }
}
/** Process-wide singleton. See {@link ApiActivityTracker}. */
export const apiActivityTracker = new ApiActivityTracker();
//# sourceMappingURL=api-activity-tracker.js.map