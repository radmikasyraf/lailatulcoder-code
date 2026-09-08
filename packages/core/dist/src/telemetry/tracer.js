/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { trace, context, ROOT_CONTEXT, SpanStatusCode, TraceFlags, } from '@opentelemetry/api';
import { SERVICE_NAME } from './constants.js';
import { deriveTraceId, randomSpanId } from './trace-id-utils.js';
import { createDebugLogger } from '../utils/debugLogger.js';
const tracer = trace.getTracer(SERVICE_NAME);
const debugLogger = createDebugLogger('OTEL_TRACER');
const TELEMETRY_WARNING_INTERVAL_MS = 30_000;
export const API_CALL_FAILED_SPAN_STATUS_MESSAGE = 'API call failed';
export const API_CALL_ABORTED_SPAN_STATUS_MESSAGE = 'API call aborted';
const OPERATION_FAILED_SPAN_STATUS_MESSAGE = 'Operation failed';
let lastTelemetryWarningMs;
let suppressedTelemetryWarnings = 0;
function warnTelemetryOperationFailed(operation, error) {
    const now = Date.now();
    if (lastTelemetryWarningMs !== undefined &&
        now - lastTelemetryWarningMs < TELEMETRY_WARNING_INTERVAL_MS) {
        suppressedTelemetryWarnings += 1;
        return;
    }
    const suppressedSuffix = suppressedTelemetryWarnings > 0
        ? `; suppressed ${suppressedTelemetryWarnings} similar warning(s)`
        : '';
    suppressedTelemetryWarnings = 0;
    lastTelemetryWarningMs = now;
    try {
        debugLogger.warn(`OTel span ${operation} failed: ${error instanceof Error ? error.message : String(error)}${suppressedSuffix}`);
    }
    catch {
        // Diagnostics must not mask caller behavior.
    }
}
export function safeSetStatus(span, status) {
    try {
        span.setStatus(status);
    }
    catch (error) {
        warnTelemetryOperationFailed('setStatus', error);
        // OTel errors must not mask caller behavior.
    }
}
function safeEndSpan(span) {
    try {
        span.end();
    }
    catch (error) {
        warnTelemetryOperationFailed('end', error);
        // OTel errors must not mask caller behavior.
    }
}
// SYNC: keep parent-resolution logic in step with resolveParentContext()
// in telemetry/session-tracing.ts.
function getParentContext() {
    return context.active();
}
/**
 * Wraps a Span to track whether setStatus has been called by the callback.
 * This prevents withSpan from overwriting an ERROR status that the caller
 * has already set on handled-failure paths (e.g. tool hook denial).
 */
function wrapSpanWithStatusTracking(span) {
    let statusSet = false;
    const wrappedSpan = new Proxy(span, {
        get(target, prop, receiver) {
            if (prop === 'setStatus') {
                return (status) => {
                    statusSet = true;
                    safeSetStatus(target, status);
                    return target;
                };
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return { wrappedSpan, wasStatusSet: () => statusSet };
}
/**
 * Run an async function within a new OTel span.
 * When no parent span is active, the span becomes a trace root with a
 * fresh SDK-generated traceId. When the OTel SDK is not initialized,
 * the tracer is a noop.
 *
 * If the callback sets a status explicitly (e.g. ERROR on a handled failure),
 * withSpan will not overwrite it. Only when no status has been set and the
 * callback resolves without throwing will the span be marked OK (unless
 * autoOkOnSuccess is false). If the callback throws before setting status,
 * the span is marked ERROR with a generic message so raw exception text is
 * not exported to OTel backends.
 */
export async function withSpan(name, attributes, fn, options) {
    const autoOkOnSuccess = options?.autoOkOnSuccess ?? true;
    const parentCtx = getParentContext();
    return tracer.startActiveSpan(name, { attributes }, parentCtx, async (span) => {
        const { wrappedSpan, wasStatusSet } = wrapSpanWithStatusTracking(span);
        try {
            const result = await fn(wrappedSpan);
            if (autoOkOnSuccess && !wasStatusSet()) {
                safeSetStatus(span, { code: SpanStatusCode.OK });
            }
            return result;
        }
        catch (error) {
            if (!wasStatusSet()) {
                safeSetStatus(span, {
                    code: SpanStatusCode.ERROR,
                    message: OPERATION_FAILED_SPAN_STATUS_MESSAGE,
                });
            }
            throw error;
        }
        finally {
            safeEndSpan(span);
        }
    });
}
/**
 * Start a span manually, returning the span and a function to run code
 * within that span's context.
 *
 * Unlike withSpan, this helper does not automatically set a terminal status
 * or end the span. Callers must set the final status themselves and call
 * span.end() from a finally block. Use runInContext around any eager work
 * that should be parented to this span, and around async-generator iteration
 * when the span must remain active while the consumer pulls values.
 *
 * Example:
 *
 *   const { span, runInContext } = startSpanWithContext('stream', attrs);
 *   try {
 *     return await runInContext(() => doWork());
 *   } catch (error) {
 *     span.setStatus({ code: SpanStatusCode.ERROR, message: 'failed' });
 *     throw error;
 *   } finally {
 *     span.end();
 *   }
 *
 * For a returned stream, put the try/catch/finally in the returned generator
 * wrapper so the span ends when iteration completes, not when the stream is
 * created.
 */
export function startSpanWithContext(name, attributes) {
    const parentCtx = getParentContext();
    const span = tracer.startSpan(name, { attributes }, parentCtx);
    const spanCtx = trace.setSpan(parentCtx, span);
    return {
        span,
        runInContext: (fn) => context.with(spanCtx, fn),
    };
}
/**
 * Determine whether the synthetic session root should force the SAMPLED flag.
 *
 * This function reads `OTEL_TRACES_SAMPLER` to infer the sampler type.
 * If a sampler is configured programmatically (e.g. via NodeSDK constructor)
 * without setting the env var, this heuristic will not detect it.
 *
 * parentbased_* samplers delegate to localParentNotSampled (default AlwaysOff)
 * when the parent carries TraceFlags.NONE. Since our synthetic root is the
 * parent of all session spans, it MUST carry SAMPLED for most parentbased_*
 * samplers — otherwise zero traces are exported.
 *
 * Note: `parentbased_traceidratio` users expect probabilistic sampling, but
 * because our synthetic root is always present with SAMPLED, the ratio sampler
 * (only consulted for parentless root spans) is never invoked — they
 * effectively get 100% sampling. This is intentional: the alternative
 * (TraceFlags.NONE) would produce zero traces.
 *
 * Exception: `parentbased_always_off` explicitly wants no sampling. Forcing
 * SAMPLED would cause ParentBasedSampler to delegate to localParentSampled
 * (default AlwaysOn), sampling everything — the opposite of the user's intent.
 *
 * For non-parentbased samplers (e.g. `traceidratio`, `always_off`), each span
 * is evaluated independently regardless of parent flags, so we use NONE to
 * let the sampler decide. `always_on` is the exception — it ignores parent
 * flags, so SAMPLED is harmless and keeps the decision matrix explicit.
 */
export function shouldForceSampled() {
    const sampler = process.env['OTEL_TRACES_SAMPLER']?.trim().toLowerCase() ?? '';
    if (!sampler || sampler.startsWith('parentbased_')) {
        if (sampler.includes('always_off'))
            return false;
        return true;
    }
    return sampler === 'always_on';
}
/**
 * @deprecated No longer used for span parenting — each interaction is now a
 * trace root with its own traceId. Retained for backward compatibility
 * and existing tests.
 */
export function createSessionRootContext(sessionId) {
    const traceId = deriveTraceId(sessionId);
    const spanId = randomSpanId();
    const rootSpan = trace.wrapSpanContext({
        traceId,
        spanId,
        traceFlags: shouldForceSampled() ? TraceFlags.SAMPLED : TraceFlags.NONE,
        isRemote: false,
    });
    return trace.setSpan(ROOT_CONTEXT, rootSpan);
}
//# sourceMappingURL=tracer.js.map