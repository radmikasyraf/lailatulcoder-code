/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createContextKey } from '@opentelemetry/api';
const sessionIdContextKey = createContextKey('lailatul-coder.telemetry.session-id');
let sessionRootContext;
let currentSessionId;
export function setSessionContext(ctx, sessionId) {
    sessionRootContext = ctx;
    currentSessionId = sessionId;
}
export function getSessionContext() {
    return sessionRootContext;
}
/**
 * Returns the most recent session ID passed to setSessionContext.
 * This remains the final compatibility fallback for single-session telemetry
 * paths that have no explicit owner or scoped context.
 */
export function getCurrentSessionId() {
    return currentSessionId;
}
export function setSessionIdOnContext(ctx, sessionId) {
    if (!sessionId)
        return ctx;
    return ctx.setValue(sessionIdContextKey, sessionId);
}
export function getSessionIdFromContext(ctx) {
    const sessionId = ctx.getValue(sessionIdContextKey);
    return typeof sessionId === 'string' && sessionId ? sessionId : undefined;
}
//# sourceMappingURL=session-context.js.map