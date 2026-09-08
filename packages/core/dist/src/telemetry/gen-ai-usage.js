/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
const usageProvenance = new WeakMap();
export function setGenAiUsageProvenance(usage, provenance) {
    usageProvenance.set(usage, provenance);
}
export function getGenAiUsageProvenance(usage) {
    return usage ? usageProvenance.get(usage) : undefined;
}
//# sourceMappingURL=gen-ai-usage.js.map