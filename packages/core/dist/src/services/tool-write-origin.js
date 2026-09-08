/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export const TOOL_WRITE_ORIGIN_META_KEY = 'lailatul-coder/tool-write-origin';
export const TOOL_WRITE_ORIGINS = [
    'write_file',
    'edit',
    'notebook_edit',
    'shell_sed_edit',
];
const TOOL_WRITE_ORIGIN_SET = new Set(TOOL_WRITE_ORIGINS);
export function buildToolWriteOriginMeta(meta, source) {
    const sanitized = { ...meta };
    delete sanitized[TOOL_WRITE_ORIGIN_META_KEY];
    if (source !== undefined) {
        sanitized[TOOL_WRITE_ORIGIN_META_KEY] = { version: 1, source };
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
export function parseToolWriteOriginMeta(meta) {
    const marker = meta?.[TOOL_WRITE_ORIGIN_META_KEY];
    if (typeof marker !== 'object' || marker === null || Array.isArray(marker)) {
        return undefined;
    }
    const keys = Object.keys(marker);
    if (keys.length !== 2 ||
        !Object.hasOwn(marker, 'version') ||
        !Object.hasOwn(marker, 'source')) {
        return undefined;
    }
    const record = marker;
    return record['version'] === 1 &&
        typeof record['source'] === 'string' &&
        TOOL_WRITE_ORIGIN_SET.has(record['source'])
        ? record['source']
        : undefined;
}
//# sourceMappingURL=tool-write-origin.js.map