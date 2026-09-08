/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * cua-driver permission error patterns. Order matters — more specific
 * patterns first; the generic "Missing TCC grant" / "needs your
 * permission" fallbacks are last so they don't preempt the specific ones.
 */
const PATTERNS = [
    {
        kind: 'accessibility',
        regex: /accessibility:?\s*(missing|denied|not granted)/i,
    },
    { kind: 'accessibility', regex: /accessibility permission/i },
    {
        kind: 'screenRecording',
        regex: /screen recording:?\s*(missing|denied|not granted)/i,
    },
    { kind: 'screenRecording', regex: /screen recording permission/i },
    {
        kind: 'unknown_permission',
        regex: /missing tcc grant|needs your permission/i,
    },
];
export function detectPermissionError(result) {
    if (!result.isError)
        return 'none';
    const text = result.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('\n');
    for (const { kind, regex } of PATTERNS) {
        if (regex.test(text))
            return kind;
    }
    return 'other';
}
//# sourceMappingURL=permission-detector.js.map