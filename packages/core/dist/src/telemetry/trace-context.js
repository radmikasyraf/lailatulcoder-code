/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { trace, isSpanContextValid, INVALID_TRACEID } from '@opentelemetry/api';
import { getSessionContext } from './session-context.js';
export const ZERO_TRACE_ID = INVALID_TRACEID;
function extractTraceContext(span) {
    const ctx = span?.spanContext();
    if (ctx && isSpanContextValid(ctx)) {
        return {
            traceId: ctx.traceId,
            spanId: ctx.spanId,
            traceFlags: ctx.traceFlags,
        };
    }
    return null;
}
export function getActiveSpanTraceContext() {
    try {
        return extractTraceContext(trace.getActiveSpan());
    }
    catch {
        return null;
    }
}
export function getSessionRootTraceContext() {
    try {
        const sessionCtx = getSessionContext();
        return extractTraceContext(sessionCtx ? trace.getSpan(sessionCtx) : undefined);
    }
    catch {
        return null;
    }
}
export function getTraceContext() {
    return getActiveSpanTraceContext() ?? getSessionRootTraceContext();
}
export function formatTraceparent(ctx) {
    const flags = (ctx.traceFlags & 0xff).toString(16).padStart(2, '0');
    return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}
let shellTracePropagationEnabled = false;
export function setShellTracePropagation(enabled) {
    shellTracePropagationEnabled = enabled;
}
export function isShellTracePropagationEnabled() {
    return shellTracePropagationEnabled;
}
//# sourceMappingURL=trace-context.js.map