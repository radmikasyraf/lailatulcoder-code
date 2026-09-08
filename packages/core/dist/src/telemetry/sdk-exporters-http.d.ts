/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * OTLP HTTP exporter chain (issue #7264, follow-up to #4748).
 *
 * Owns the HTTP protocol exporters and, through them, the shared OTLP
 * serialization layer (otlp-transformer + otlp-exporter-base, ~0.9 MiB
 * bundled). It must only ever be loaded via the dynamic `import()` in
 * `sdk-impl.ts#startTelemetrySdk`, so telemetry-enabled processes using the
 * gRPC or file exporters skip this chain entirely. Do not import this module
 * statically.
 */
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter as OTLPLogExporterHttp } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { LogToSpanProcessor, type LogToSpanDiagnosticsSink } from './log-to-span-processor.js';
export interface HttpExporterOptions {
    tracesUrl: string | undefined;
    logsUrl: string | undefined;
    metricsUrl: string | undefined;
    logToSpan: {
        includeSensitiveSpanAttributes: boolean;
        diagnosticsSink?: LogToSpanDiagnosticsSink;
    };
}
export interface HttpExporters {
    spanExporter: OTLPTraceExporterHttp | undefined;
    logExporter: OTLPLogExporterHttp | undefined;
    metricReader: PeriodicExportingMetricReader | undefined;
    logToSpanProcessor: LogToSpanProcessor | undefined;
}
export declare function createHttpExporters(options: HttpExporterOptions): HttpExporters;
