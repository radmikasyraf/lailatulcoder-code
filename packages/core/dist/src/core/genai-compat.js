/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
// Keep runtime values limited to the subset used outside provider adapters.
export const FinishReason = {
    STOP: 'STOP',
    MAX_TOKENS: 'MAX_TOKENS',
};
export const FunctionCallingConfigMode = {
    ANY: 'ANY',
};
// Content conversion is adapted from @google/genai 2.6.0's `_isPart` and
// `_toParts` helpers (Copyright 2025 Google LLC, Apache-2.0); re-check parity
// on SDK upgrades.
function isPart(value) {
    return (typeof value === 'object' &&
        value !== null &&
        ('fileData' in value ||
            'text' in value ||
            'functionCall' in value ||
            'functionResponse' in value ||
            'inlineData' in value ||
            'videoMetadata' in value ||
            'codeExecutionResult' in value ||
            'executableCode' in value));
}
function toParts(partOrString) {
    if (typeof partOrString === 'string') {
        return [{ text: partOrString }];
    }
    if (isPart(partOrString)) {
        return [partOrString];
    }
    if (!Array.isArray(partOrString)) {
        throw new Error('partOrString must be a Part object, string, or array');
    }
    if (partOrString.length === 0) {
        throw new Error('partOrString cannot be an empty array');
    }
    return partOrString.map((part) => {
        if (typeof part === 'string') {
            return { text: part };
        }
        if (isPart(part)) {
            return part;
        }
        throw new Error('element in PartUnion must be a Part object or string');
    });
}
function createContent(role, value) {
    return { role, parts: toParts(value) };
}
export function createUserContent(value) {
    return createContent('user', value);
}
export function createModelContent(value) {
    return createContent('model', value);
}
//# sourceMappingURL=genai-compat.js.map