/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { MCPServerConfig } from '../config/config.js';
/**
 * Resolve the discovery timeout for a server config. stdio defaults
 * to 30s, remote (HTTP / SSE / WebSocket) defaults to 5s, per-server
 * `discoveryTimeoutMs` override is honored when present (clamped to
 * [100ms, 300s]).
 */
export declare function discoveryTimeoutFor(cfg: MCPServerConfig): number;
/**
 * Race `task` against a wall-clock timer. The background `task`
 * promise is NOT cancelled on timeout — Node's Promise model can't
 * cancel an in-flight `await`. Instead, the caller's catch block
 * runs `forceShutdown`/`sweepAndDisconnect` which closes the
 * transport, racing the disconnect ahead of any silent tool
 * registration the slow server might be midway through. Same
 * approach `McpClientManager.runWithDiscoveryTimeout` uses for the
 * same race.
 *
 * Returns the `task` value on success; rejects with a
 * `Timed out after Nms: <label>` Error if the timer fires first.
 */
export declare function runWithTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T>;
