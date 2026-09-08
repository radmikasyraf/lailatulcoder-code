/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * T2.8: thrown by `McpClientManager.addRuntimeMcpServer` when adding the
 * server would exceed the workspace MCP budget in `enforce` mode.
 */
export declare class McpBudgetWouldExceedError extends Error {
    readonly code: "mcp_budget_would_exceed";
    readonly serverName: string;
    constructor(serverName: string);
}
/**
 * T2.8: thrown by `McpClientManager.addRuntimeMcpServer` when the
 * transport spawn (pool acquire / McpClient connect) fails.
 */
export declare class McpServerSpawnFailedError extends Error {
    readonly code: "mcp_server_spawn_failed";
    readonly serverName: string;
    readonly details: {
        exitCode?: number;
        stderr?: string;
        timeout?: boolean;
    };
    constructor(serverName: string, details: {
        exitCode?: number;
        stderr?: string;
        timeout?: boolean;
    });
}
/**
 * T2.8: thrown by `McpClientManager.addRuntimeMcpServer` when the
 * provided server config is structurally invalid (e.g. missing both
 * `command` and `url`/`httpUrl`).
 */
export declare class InvalidMcpConfigError extends Error {
    readonly code: "invalid_config";
    readonly serverName: string;
    readonly reason: string;
    constructor(serverName: string, reason: string);
}
