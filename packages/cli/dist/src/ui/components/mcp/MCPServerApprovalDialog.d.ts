/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import type { PendingMcpServer } from '../../hooks/useMcpApproval.js';
export declare enum McpApprovalChoice {
    APPROVE = "approve",
    APPROVE_ALL = "approve_all",
    REJECT = "reject"
}
interface MCPServerApprovalDialogProps {
    /** Name of the gated server currently being decided. */
    serverName: string;
    /** One-line summary of its transport/config (e.g. `node slack.js (stdio)`). */
    summary: string;
    /** Where the config came from (e.g. `.mcp.json`, `.qwen/settings.json`). */
    source: string;
    /** All pending servers that would be approved by "Approve all". */
    pendingServers: PendingMcpServer[];
    /** How many more pending gated servers follow this one. */
    remaining: number;
    onSelect: (choice: McpApprovalChoice) => void;
}
export declare const MCPServerApprovalDialog: React.FC<MCPServerApprovalDialogProps>;
export {};
