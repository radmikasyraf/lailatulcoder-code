/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
export const daemonTelemetryResponseContext = Symbol('daemonTelemetryResponseContext');
// The captured caller trace id lives under its own symbol: the presence of
// the telemetry response context doubles as the opt-in gate for
// handler-resolved workspace attribution (see setDaemonTelemetryWorkspace),
// so capturing a trace id must never create it — otherwise a caller merely
// sending a traceparent header would silently change span attribution.
export const daemonInboundTraceIdContext = Symbol('daemonInboundTraceIdContext');
/**
 * The caller trace id captured from a valid inbound `traceparent` header,
 * in both telemetry modes. The access log reads it so a request's log line
 * still joins with the caller's logs (or trace backend) with no daemon-side
 * telemetry at all.
 */
export function getDaemonTelemetryInboundTraceId(res) {
    try {
        return res[daemonInboundTraceIdContext];
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=telemetry-context.js.map