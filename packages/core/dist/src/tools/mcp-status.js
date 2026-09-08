/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Enum representing the connection status of an MCP server
 */
export var MCPServerStatus;
(function (MCPServerStatus) {
    /** Server is disconnected or experiencing errors */
    MCPServerStatus["DISCONNECTED"] = "disconnected";
    /** Server is in the process of connecting */
    MCPServerStatus["CONNECTING"] = "connecting";
    /** Server is connected and ready to use */
    MCPServerStatus["CONNECTED"] = "connected";
})(MCPServerStatus || (MCPServerStatus = {}));
/**
 * Map to track the status of each MCP server within the core package
 */
const serverStatuses = new Map();
const statusChangeListeners = [];
/**
 * Add a listener for MCP server status changes
 */
export function addMCPStatusChangeListener(listener) {
    statusChangeListeners.push(listener);
}
/**
 * Remove a listener for MCP server status changes
 */
export function removeMCPStatusChangeListener(listener) {
    const index = statusChangeListeners.indexOf(listener);
    if (index !== -1) {
        statusChangeListeners.splice(index, 1);
    }
}
/**
 * Update the status of an MCP server
 */
export function updateMCPServerStatus(serverName, status) {
    serverStatuses.set(serverName, status);
    // Snapshot the listener list so a listener that detaches itself (or
    // attaches a new one) during dispatch doesn't mutate the array we're
    // iterating.
    for (const listener of [...statusChangeListeners]) {
        listener(serverName, status);
    }
}
/**
 * Remove an MCP server from the status registry and notify listeners.
 * Used when a server is disabled or removed from configuration so it no
 * longer shows up in the Footer's MCP health pill as offline.
 */
export function removeMCPServerStatus(serverName) {
    if (!serverStatuses.has(serverName)) {
        return;
    }
    serverStatuses.delete(serverName);
    for (const listener of [...statusChangeListeners]) {
        listener(serverName, undefined);
    }
}
/**
 * Get the current status of an MCP server
 */
export function getMCPServerStatus(serverName) {
    return serverStatuses.get(serverName) || MCPServerStatus.DISCONNECTED;
}
/**
 * Get all MCP server statuses
 */
export function getAllMCPServerStatuses() {
    return new Map(serverStatuses);
}
//# sourceMappingURL=mcp-status.js.map