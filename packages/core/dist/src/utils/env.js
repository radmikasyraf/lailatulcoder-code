/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export function parsePositiveIntegerEnv(value, fallback) {
    const trimmed = value?.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
        return fallback;
    }
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
//# sourceMappingURL=env.js.map