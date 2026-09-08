/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from 'node:crypto';
import { context as otelContext, defaultTextMapGetter, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, TraceFlags, } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { SERVICE_NAME } from './constants.js';
import { isTelemetrySdkInitialized } from './sdk.js';
import { shouldForceSampled } from './tracer.js';
import { truncateSpanError } from './session-tracing.js';
import { formatTraceparent, getActiveSpanTraceContext, } from './trace-context.js';
import { setSessionIdOnContext } from './session-context.js';
export const DAEMON_TRACEPARENT_META_KEY = 'qwen.telemetry.traceparent';
export const DAEMON_TRACESTATE_META_KEY = 'qwen.telemetry.tracestate';
const SPAN_DAEMON_REQUEST = 'lailatul-coder.daemon.request';
const SPAN_DAEMON_BRIDGE = 'lailatul-coder.daemon.bridge';
const EVENT_DAEMON_ERROR = 'lailatul-coder.daemon.error';
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
function errorType(error) {
    if (error instanceof Error)
        return error.name || 'Error';
    return typeof error;
}
function stripReservedTraceMeta(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return {};
    const record = meta;
    if (!(DAEMON_TRACEPARENT_META_KEY in record) &&
        !(DAEMON_TRACESTATE_META_KEY in record)) {
        return { ...record };
    }
    const out = { ...record };
    delete out[DAEMON_TRACEPARENT_META_KEY];
    delete out[DAEMON_TRACESTATE_META_KEY];
    return out;
}
export function hashDaemonWorkspace(workspace) {
    return createHash('sha256').update(workspace).digest('hex').slice(0, 16);
}
export async function withDaemonSpan(name, attributes, fn, options = {}) {
    if (!isTelemetrySdkInitialized()) {
        return await fn(undefined);
    }
    const autoOkOnSuccess = options.autoOkOnSuccess ?? true;
    const tracer = trace.getTracer(SERVICE_NAME);
    const spanOptions = {
        kind: SpanKind.INTERNAL,
        attributes,
        ...(options.startTime ? { startTime: options.startTime } : {}),
    };
    const run = async (span) => {
        const sessionId = attributes['session.id'];
        const scopedContext = setSessionIdOnContext(otelContext.active(), typeof sessionId === 'string' ? sessionId : undefined);
        return await otelContext.with(scopedContext, async () => {
            try {
                const result = await fn(span);
                if (autoOkOnSuccess) {
                    span.setStatus({ code: SpanStatusCode.OK });
                }
                return result;
            }
            catch (error) {
                recordDaemonError(span, error);
                throw error;
            }
            finally {
                span.end();
            }
        });
    };
    return options.parentContext
        ? await tracer.startActiveSpan(name, spanOptions, options.parentContext, run)
        : await tracer.startActiveSpan(name, spanOptions, run);
}
export async function withDaemonRequestSpan(options, fn) {
    return await withDaemonSpan(SPAN_DAEMON_REQUEST, {
        'http.request.method': options.method,
        'http.route': options.route,
        'lailatul-coder.daemon.operation': 'http_request',
        ...(options.workspaceHash
            ? { 'lailatul-coder.workspace.hash': options.workspaceHash }
            : {}),
        ...(options.sessionId ? { 'session.id': options.sessionId } : {}),
        ...(options.clientId ? { 'lailatul-coder.client_id': options.clientId } : {}),
        ...(options.permissionRequestId
            ? {
                'lailatul-coder.daemon.permission.request_id': options.permissionRequestId,
            }
            : {}),
        ...(options.deferredRuntimeWaitMs !== undefined
            ? {
                'lailatul-coder.daemon.runtime.wait_ms': options.deferredRuntimeWaitMs,
            }
            : {}),
        ...(options.deferredRuntimePath
            ? { 'lailatul-coder.daemon.runtime.path': options.deferredRuntimePath }
            : {}),
    }, fn, {
        autoOkOnSuccess: false,
        startTime: options.startTime,
        parentContext: options.parentContext,
    });
}
export async function withDaemonBridgeSpan(operation, attributes, fn) {
    return await withDaemonSpan(SPAN_DAEMON_BRIDGE, {
        'lailatul-coder.daemon.operation': operation,
        ...attributes,
    }, async () => await fn());
}
export function recordDaemonHttpResponse(span, statusCode) {
    try {
        span?.setAttribute('http.response.status_code', statusCode);
    }
    catch {
        // Telemetry must not affect request handling.
    }
}
export function addDaemonRequestAttribute(key, value) {
    try {
        trace.getSpan(otelContext.active())?.setAttribute(key, value);
    }
    catch {
        // Telemetry must not affect request handling.
    }
}
export function recordDaemonError(span, error, attributes = {}) {
    const target = span ?? trace.getSpan(otelContext.active());
    if (!target)
        return;
    try {
        const message = truncateSpanError(errorMessage(error));
        target.recordException(error instanceof Error ? error : new Error(message));
        target.setAttributes({
            'error.type': errorType(error),
            'error.message': message,
            ...attributes,
        });
        target.setStatus({ code: SpanStatusCode.ERROR, message });
    }
    catch {
        // Telemetry must not affect request handling.
    }
}
export function emitDaemonLog(body, attributes = {}, options) {
    if (!isTelemetrySdkInitialized())
        return;
    try {
        logs.getLogger(SERVICE_NAME).emit({
            body,
            timestamp: new Date(),
            attributes: {
                'event.name': options?.eventName ?? EVENT_DAEMON_ERROR,
                ...attributes,
            },
            ...(options?.severityNumber != null
                ? { severityNumber: options.severityNumber }
                : {}),
        });
    }
    catch {
        // Telemetry must not affect daemon behavior.
    }
}
export function captureDaemonTelemetryContext() {
    return { context: otelContext.active() };
}
export async function runWithDaemonTelemetryContext(captured, fn) {
    const ctx = captured &&
        typeof captured === 'object' &&
        'context' in captured &&
        captured.context
        ? captured.context
        : undefined;
    if (!ctx)
        return await fn();
    return await otelContext.with(ctx, fn);
}
export function injectDaemonTraceContext(request) {
    const currentMeta = request._meta;
    const nextMeta = stripReservedTraceMeta(currentMeta);
    try {
        const ctx = getActiveSpanTraceContext();
        if (ctx) {
            nextMeta[DAEMON_TRACEPARENT_META_KEY] = formatTraceparent(ctx);
        }
    }
    catch {
        // Telemetry must not affect prompt forwarding.
    }
    if (!currentMeta && !nextMeta[DAEMON_TRACEPARENT_META_KEY]) {
        return request;
    }
    return {
        ...request,
        _meta: nextMeta,
    };
}
// Fallback propagator for `contextFromTraceparentValues` below. The global
// propagator stays a no-op unless the daemon SDK registered one (opt-in
// outbound propagation), so extraction needs a direct W3C instance to apply
// the same acceptance rules — future traceparent versions, tracestate,
// all-zero ids — as the registered path. The instance is injected by the
// lazy SDK chunk (`sdk-impl.ts`) instead of being constructed here: this
// module sits on every CLI launch's static startup graph, and
// @opentelemetry/core is a CJS barrel that tree-shaking cannot slim down
// (~65 KB per launch even with telemetry off). Until the SDK initializes,
// the holder stays empty and extraction returns no parent context — the
// telemetry-off state, with no OTel side effects.
let daemonFallbackPropagator;
/**
 * Install the W3C fallback propagator used by inbound traceparent
 * extraction. Called by the dynamically imported SDK chunk (`sdk-impl.ts`)
 * once telemetry is actually enabled, so @opentelemetry/core never enters
 * the static startup graph (the `TextMapPropagator` type import above costs
 * nothing at runtime).
 */
export function setDaemonFallbackPropagator(propagator) {
    daemonFallbackPropagator = propagator;
}
function contextFromTraceparentValues(traceparent, tracestate) {
    const carrier = { traceparent };
    if (typeof tracestate === 'string' && tracestate.length > 0) {
        carrier['tracestate'] = tracestate;
    }
    const extracted = propagation.extract(ROOT_CONTEXT, carrier);
    if (trace.getSpanContext(extracted))
        return extracted;
    if (!daemonFallbackPropagator)
        return undefined;
    const fallback = daemonFallbackPropagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
    return trace.getSpanContext(fallback) ? fallback : undefined;
}
// A remote caller's `sampled=0` is head-based ratio sampling on their
// side, not a request to drop daemon telemetry. Under the default
// parentbased_always_on sampler a remote unsampled parent delegates to
// AlwaysOff, silently deleting the request span, everything under it, and —
// via _meta forwarding — the session subprocess spans. Reuse the
// session-root decision matrix: parentbased defaults and always_on force
// SAMPLED; parentbased_always_off honors the operator's opt-out;
// non-parentbased samplers decide per span.
function forceSampledUnderSampler(extracted) {
    if (!extracted || !shouldForceSampled())
        return extracted;
    const spanContext = trace.getSpanContext(extracted);
    if (!spanContext)
        return extracted;
    return trace.setSpan(extracted, trace.wrapSpanContext({
        ...spanContext,
        traceFlags: spanContext.traceFlags | TraceFlags.SAMPLED,
    }));
}
export function extractDaemonTraceContext(source) {
    const meta = source?._meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return undefined;
    }
    const record = meta;
    const traceparent = record[DAEMON_TRACEPARENT_META_KEY];
    if (typeof traceparent !== 'string' || traceparent.length === 0) {
        return undefined;
    }
    // The _meta path is reachable from two kinds of callers: the in-process
    // bridge (injectDaemonTraceContext, values already SAMPLED so forcing is a
    // no-op) and direct ACP clients whose request _meta is external input just
    // like the HTTP header — so both edges get the same sampled protection.
    return forceSampledUnderSampler(contextFromTraceparentValues(traceparent, record[DAEMON_TRACESTATE_META_KEY]));
}
export function extractDaemonHttpTraceContext(headers) {
    const traceparent = headers?.['traceparent'];
    if (typeof traceparent !== 'string' || traceparent.length === 0) {
        return undefined;
    }
    const extracted = contextFromTraceparentValues(traceparent, headers?.['tracestate']);
    return forceSampledUnderSampler(extracted);
}
const TRACEPARENT_RE = /^\s?([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?\s?$/;
const ALL_ZERO_TRACE_ID = '0'.repeat(32);
const ALL_ZERO_SPAN_ID = '0'.repeat(16);
/**
 * Extract the caller's trace id from an inbound `traceparent` header without
 * any OpenTelemetry machinery. Unlike {@link extractDaemonHttpTraceContext}
 * (which builds a span parent and needs the W3C propagator — only installed
 * once the telemetry SDK starts), this is a plain format check so the daemon
 * log can carry the caller's trace id even with telemetry disabled: the
 * log-based join then works with no trace backend at all. The acceptance
 * rules mirror the vendored W3C propagator exactly (single optional leading/
 * trailing whitespace, trailing fields allowed above version `00`, `ff` and
 * all-zero ids rejected), so a header either joins on both paths or neither.
 */
export function extractInboundTraceId(headers) {
    const traceparent = headers?.['traceparent'];
    if (typeof traceparent !== 'string' || traceparent.length === 0) {
        return undefined;
    }
    const match = TRACEPARENT_RE.exec(traceparent);
    if (!match)
        return undefined;
    // match: [full, version, traceId, spanId, flags, trailingFields]
    const [, version, traceId, spanId, , trailing] = match;
    // Version 00 must be exactly four fields; higher versions may carry
    // trailing extension fields the parser ignores — same as the propagator.
    if (version === '00' && trailing !== undefined)
        return undefined;
    if (version === 'ff')
        return undefined;
    if (traceId === ALL_ZERO_TRACE_ID || spanId === ALL_ZERO_SPAN_ID) {
        return undefined;
    }
    return traceId;
}
export function createDaemonBridgeTelemetry() {
    return {
        captureContext: captureDaemonTelemetryContext,
        runWithContext: runWithDaemonTelemetryContext,
        withSpan: withDaemonBridgeSpan,
        setActiveSpanAttributes(attributes) {
            if (!isTelemetrySdkInitialized())
                return;
            try {
                trace.getSpan(otelContext.active())?.setAttributes(attributes);
            }
            catch {
                // Telemetry must not affect bridge behavior.
            }
        },
        event(name, attributes) {
            if (!isTelemetrySdkInitialized())
                return;
            try {
                const activeSpan = trace.getSpan(otelContext.active());
                if (activeSpan) {
                    activeSpan.addEvent(name, attributes);
                    return;
                }
                const span = trace
                    .getTracer(SERVICE_NAME)
                    .startSpan(SPAN_DAEMON_BRIDGE, {
                    kind: SpanKind.INTERNAL,
                    attributes: {
                        'event.name': name,
                        'lailatul-coder.daemon.operation': `event.${name}`,
                        ...attributes,
                    },
                });
                span.addEvent(name, attributes);
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
            }
            catch {
                // Telemetry must not affect bridge behavior.
            }
        },
        injectPromptContext: injectDaemonTraceContext,
    };
}
//# sourceMappingURL=daemon-tracing.js.map