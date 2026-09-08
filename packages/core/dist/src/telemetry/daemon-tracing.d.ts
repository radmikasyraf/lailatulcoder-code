/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Context, type Span, type TextMapPropagator } from '@opentelemetry/api';
import { type LogAttributes } from '@opentelemetry/api-logs';
export declare const DAEMON_TRACEPARENT_META_KEY = "qwen.telemetry.traceparent";
export declare const DAEMON_TRACESTATE_META_KEY = "qwen.telemetry.tracestate";
type DaemonAttributes = Record<string, string | number | boolean>;
interface CapturedDaemonContext {
    context: Context;
}
export interface DaemonRequestSpanOptions {
    method: string;
    route: string;
    startTime?: Date;
    deferredRuntimeWaitMs?: number;
    deferredRuntimePath?: 'started_on_request' | 'joined';
    workspaceHash?: string;
    sessionId?: string;
    clientId?: string;
    permissionRequestId?: string;
    parentContext?: Context;
}
export declare function hashDaemonWorkspace(workspace: string): string;
export declare function withDaemonSpan<T>(name: string, attributes: DaemonAttributes, fn: (span: Span) => Promise<T>, options?: {
    autoOkOnSuccess?: boolean;
    parentContext?: Context;
    startTime?: Date;
}): Promise<T>;
export declare function withDaemonRequestSpan<T>(options: DaemonRequestSpanOptions, fn: (span: Span) => Promise<T>): Promise<T>;
export declare function withDaemonBridgeSpan<T>(operation: string, attributes: DaemonAttributes, fn: () => Promise<T>): Promise<T>;
export declare function recordDaemonHttpResponse(span: Span | undefined, statusCode: number): void;
export declare function addDaemonRequestAttribute(key: string, value: string | number | boolean): void;
export declare function recordDaemonError(span: Span | undefined, error: unknown, attributes?: DaemonAttributes): void;
export declare function emitDaemonLog(body: string, attributes?: LogAttributes, options?: {
    eventName?: string;
    severityNumber?: number;
}): void;
export declare function captureDaemonTelemetryContext(): CapturedDaemonContext;
export declare function runWithDaemonTelemetryContext<T>(captured: unknown, fn: () => Promise<T>): Promise<T>;
export declare function injectDaemonTraceContext<T extends object>(request: T): T;
/**
 * Install the W3C fallback propagator used by inbound traceparent
 * extraction. Called by the dynamically imported SDK chunk (`sdk-impl.ts`)
 * once telemetry is actually enabled, so @opentelemetry/core never enters
 * the static startup graph (the `TextMapPropagator` type import above costs
 * nothing at runtime).
 */
export declare function setDaemonFallbackPropagator(propagator: TextMapPropagator): void;
export declare function extractDaemonTraceContext(source: unknown): Context | undefined;
export declare function extractDaemonHttpTraceContext(headers: Record<string, unknown> | undefined): Context | undefined;
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
export declare function extractInboundTraceId(headers: Record<string, unknown> | undefined): string | undefined;
export interface DaemonBridgeTelemetryMetrics {
    sessionLifecycle(action: 'spawn' | 'close' | 'die'): void;
    channelLifecycle(action: 'spawn' | 'exit', expected?: boolean): void;
    promptQueueWait(durationMs: number): void;
    promptDuration(durationMs: number): void;
    cancelled(): void;
    /**
     * Per-round model token usage (input/output token increments) observed at the
     * bridge's session/update fan-in, from `agent_message_chunk._meta.usage`.
     * Values are per-round increments, not cumulative. `durationMs` is the same
     * frame's `_meta.durationMs` (the LLM API round-trip time), present only when
     * the emitter stamped it. `apiErrors` / `apiRetries` are the same frame's
     * per-round model-API-error and automatic-retry increments (0 when none), for
     * the Daemon Status model-API-health charts. Optional: only the daemon host
     * wires it (for the token-burn / LLM-latency / API-health charts);
     * embedded/test callers may omit it.
     */
    tokenUsage?(inputTokens: number, outputTokens: number, durationMs?: number, apiErrors?: number, apiRetries?: number): void;
}
export declare function createDaemonBridgeTelemetry(): {
    captureContext(): unknown;
    runWithContext<T>(captured: unknown, fn: () => Promise<T>): Promise<T>;
    withSpan<T>(operation: string, attributes: DaemonAttributes, fn: () => Promise<T>): Promise<T>;
    setActiveSpanAttributes?(attributes: DaemonAttributes): void;
    event(name: string, attributes: DaemonAttributes): void;
    injectPromptContext<T extends object>(request: T): T;
    metrics?: DaemonBridgeTelemetryMetrics;
};
export {};
