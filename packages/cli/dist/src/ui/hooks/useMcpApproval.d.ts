/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config, MCPServerConfig } from '@lailatul-coder/lailatul-coder-core';
import { McpApprovalChoice } from '../components/mcp/MCPServerApprovalDialog.js';
export interface PendingMcpServer {
    name: string;
    config: MCPServerConfig;
    /** One-line transport/config summary for display. */
    summary: string;
    /** Human-readable origin of the config (e.g. `.mcp.json`), for the dialog. */
    source: string;
}
/**
 * Drives the interactive startup approval dialog for gated MCP servers — project
 * `.mcp.json` and workspace `.qwen/settings.json` (issue #4615). On mount it
 * computes the queue of `pending` gated servers; the dialog asks about them one
 * at a time. Approving persists the decision (bound to the config hash), un-gates
 * the server for this session, and re-runs discovery so it connects; rejecting
 * persists a `rejected` decision and leaves it disconnected.
 *
 * Non-interactive sessions never render this hook. They still receive the
 * loader's pending set so discovery can skip gated servers without prompting.
 */
export declare const useMcpApproval: (config: Config) => {
    isMcpApprovalDialogOpen: boolean;
    currentMcpApproval: PendingMcpServer;
    pendingMcpApprovals: PendingMcpServer[];
    mcpApprovalRemaining: number;
    handleMcpApprovalSelect: (choice: McpApprovalChoice) => Promise<void>;
};
