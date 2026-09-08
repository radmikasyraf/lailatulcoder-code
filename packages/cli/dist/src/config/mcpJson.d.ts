/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type MCPServerConfig } from '@lailatul-coder/lailatul-coder-core';
/** Project-scoped MCP config filename, read from the workspace root. */
export declare const PROJECT_MCP_FILENAME = ".mcp.json";
export interface LoadProjectMcpServersResult {
    /**
     * Servers declared in `.mcp.json`, each tagged `scope: 'project'`. These are
     * UNTRUSTED until the user approves them — loading is side-effect-free and
     * MUST NOT trigger any connection (see issue #4615). Empty when no readable
     * `.mcp.json` exists.
     */
    servers: Record<string, MCPServerConfig>;
    /** Absolute path of the `.mcp.json` that was read, if any. */
    path: string | undefined;
    /** Non-fatal problems (missing/malformed file, bad shape). Never throws. */
    errors: string[];
}
/**
 * Load project-scoped MCP servers from `<projectRoot>/.mcp.json`.
 *
 * This is a pure read: it parses JSON and tags each server with
 * `scope: 'project'` so the discovery layer can gate it behind approval. It
 * never spawns a process, opens a transport, or runs a health check. A missing
 * file is normal (returns empty); a malformed file is reported via `errors` and
 * otherwise ignored so it can never crash startup.
 */
export declare function loadProjectMcpServers(projectRoot: string): LoadProjectMcpServersResult;
