/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const ZERO_TRACE_ID = "00000000000000000000000000000000";
export interface TraceContext {
    traceId: string;
    spanId: string;
    traceFlags: number;
}
export declare function getActiveSpanTraceContext(): TraceContext | null;
export declare function getSessionRootTraceContext(): TraceContext | null;
export declare function getTraceContext(): TraceContext | null;
export declare function formatTraceparent(ctx: TraceContext): string;
export declare function setShellTracePropagation(enabled: boolean): void;
export declare function isShellTracePropagationEnabled(): boolean;
