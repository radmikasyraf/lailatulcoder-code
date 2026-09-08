/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Enum representing the connection status of an MCP server
 */
export declare enum MCPServerStatus {
    /** Server is disconnected or experiencing errors */
    DISCONNECTED = "disconnected",
    /** Server is in the process of connecting */
    CONNECTING = "connecting",
    /** Server is connected and ready to use */
    CONNECTED = "connected"
}
/**
 * Event listeners for MCP server status changes.
 * `status` is `undefined` when the server has been removed from the registry
 * (e.g. disabled via `/mcp`), so consumers can drop it from their snapshots
 * rather than continue to count it as `DISCONNECTED`.
 */
type StatusChangeListener = (serverName: string, status: MCPServerStatus | undefined) => void;
/**
 * Add a listener for MCP server status changes
 */
export declare function addMCPStatusChangeListener(listener: StatusChangeListener): void;
/**
 * Remove a listener for MCP server status changes
 */
export declare function removeMCPStatusChangeListener(listener: StatusChangeListener): void;
/**
 * Update the status of an MCP server
 */
export declare function updateMCPServerStatus(serverName: string, status: MCPServerStatus): void;
/**
 * Remove an MCP server from the status registry and notify listeners.
 * Used when a server is disabled or removed from configuration so it no
 * longer shows up in the Footer's MCP health pill as offline.
 */
export declare function removeMCPServerStatus(serverName: string): void;
/**
 * Get the current status of an MCP server
 */
export declare function getMCPServerStatus(serverName: string): MCPServerStatus;
/**
 * Get all MCP server statuses
 */
export declare function getAllMCPServerStatuses(): Map<string, MCPServerStatus>;
export {};
