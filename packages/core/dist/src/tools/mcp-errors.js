/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * T2.8: thrown by `McpClientManager.addRuntimeMcpServer` when adding the
 * server would exceed the workspace MCP budget in `enforce` mode.
 */
export class McpBudgetWouldExceedError extends Error {
    code = 'mcp_budget_would_exceed';
    serverName;
    constructor(serverName) {
        super(`Adding '${serverName}' would exceed workspace MCP budget`);
        this.name = 'McpBudgetWouldExceedError';
        this.serverName = serverName;
    }
}
/**
 * T2.8: thrown by `McpClientManager.addRuntimeMcpServer` when the
 * transport spawn (pool acquire / McpClient connect) fails.
 */
export class McpServerSpawnFailedError extends Error {
    code = 'mcp_server_spawn_failed';
    serverName;
    details;
    constructor(serverName, details) {
        super(`Failed to spawn MCP server '${serverName}': ${JSON.stringify(details)}`);
        this.name = 'McpServerSpawnFailedError';
        this.serverName = serverName;
        this.details = details;
    }
}
/**
 * T2.8: thrown by `McpClientManager.addRuntimeMcpServer` when the
 * provided server config is structurally invalid (e.g. missing both
 * `command` and `url`/`httpUrl`).
 */
export class InvalidMcpConfigError extends Error {
    code = 'invalid_config';
    serverName;
    reason;
    constructor(serverName, reason) {
        super(`Invalid MCP server config for '${serverName}': ${reason}`);
        this.name = 'InvalidMcpConfigError';
        this.serverName = serverName;
        this.reason = reason;
    }
}
//# sourceMappingURL=mcp-errors.js.map