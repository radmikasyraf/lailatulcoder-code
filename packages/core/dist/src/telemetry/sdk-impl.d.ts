/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { TelemetryRuntimeConfig } from './runtime-config.js';
export interface StartedTelemetrySdk {
    sdk: NodeSDK;
    metricReader: PeriodicExportingMetricReader | undefined;
}
/**
 * Assemble (but do not start) the NodeSDK for the given config. Returns
 * `undefined` on the unsupported gRPC-without-base-endpoint configuration,
 * matching the historical skip path. Async because the configured OTLP
 * protocol chain is loaded on demand. The facade (`sdk.ts`) owns `start()`,
 * initialized-state, and session-context wiring.
 */
export declare function startTelemetrySdk(config: TelemetryRuntimeConfig): Promise<StartedTelemetrySdk | undefined>;
