/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Leaf module for OTLP HTTP URL resolution (issue #4748).
 *
 * Kept free of `@opentelemetry/*` and any telemetry SDK dependency so both the
 * light facade (`sdk.ts`) and the heavy implementation (`sdk-impl.ts`) can
 * import it without forming a cycle between them.
 */
/**
 * Standard OTLP HTTP signal-specific paths per the OpenTelemetry specification.
 * gRPC uses service-based routing so no path appending is needed.
 */
declare const OTLP_SIGNAL_PATHS: {
    readonly traces: "v1/traces";
    readonly logs: "v1/logs";
    readonly metrics: "v1/metrics";
};
export type OtlpSignal = keyof typeof OTLP_SIGNAL_PATHS;
/**
 * Resolve the final URL for an HTTP OTLP exporter.
 *
 * - If the URL path already ends with the signal-specific path (e.g., /v1/traces),
 *   use it as-is. This supports explicit full-path configuration.
 * - Otherwise, append the signal-specific path to the base URL.
 */
export declare function resolveHttpOtlpUrl(baseEndpoint: string, signal: OtlpSignal): string;
export {};
