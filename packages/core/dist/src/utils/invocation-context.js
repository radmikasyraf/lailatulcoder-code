/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';
export const INVOCATION_CONTEXT_META_KEY = 'lailatul-coder/invocation';
export const PRIVATE_PARENT_CAPABILITY_META_KEY = 'lailatul-coder/private-parent-capability';
export const PRIVATE_ACP_CAPABILITY_ENV = 'QWEN_CODE_PRIVATE_ACP_CAPABILITY';
const invocationContextKeys = new Set([
    'version',
    'sessionId',
    'promptId',
    'originatorClientId',
]);
const invocationContextStorage = new AsyncLocalStorage();
function isNonBlankString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
export function parseInvocationContext(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }
    const record = value;
    if (Object.keys(record).some((key) => !invocationContextKeys.has(key))) {
        return undefined;
    }
    if (record['version'] !== 1 ||
        !isNonBlankString(record['sessionId']) ||
        !isNonBlankString(record['promptId'])) {
        return undefined;
    }
    let originatorClientId;
    if (Object.hasOwn(record, 'originatorClientId')) {
        if (!isNonBlankString(record['originatorClientId'])) {
            return undefined;
        }
        originatorClientId = record['originatorClientId'];
    }
    return Object.freeze({
        version: 1,
        sessionId: record['sessionId'],
        promptId: record['promptId'],
        ...(originatorClientId ? { originatorClientId } : {}),
    });
}
export function runWithInvocationContext(context, callback) {
    return invocationContextStorage.run(context, callback);
}
export function getInvocationContext() {
    return invocationContextStorage.getStore();
}
//# sourceMappingURL=invocation-context.js.map