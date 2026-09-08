/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Response } from 'express';
export interface DaemonTelemetryResponseContext {
    workspaceCwd?: string;
}
export declare const daemonTelemetryResponseContext: unique symbol;
export type TelemetryResponse = Response & {
    [daemonTelemetryResponseContext]?: DaemonTelemetryResponseContext;
};
export declare const daemonInboundTraceIdContext: unique symbol;
export type InboundTraceIdResponse = Response & {
    [daemonInboundTraceIdContext]?: string;
};
/**
 * The caller trace id captured from a valid inbound `traceparent` header,
 * in both telemetry modes. The access log reads it so a request's log line
 * still joins with the caller's logs (or trace backend) with no daemon-side
 * telemetry at all.
 */
export declare function getDaemonTelemetryInboundTraceId(res: Response): string | undefined;
