/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import { BaseDeclarativeTool } from './tools.js';
import type { ToolInvocation, ToolResult } from './tools.js';
export interface ReadMcpResourceToolParams {
    server_name: string;
    uri: string;
}
export declare class ReadMcpResourceTool extends BaseDeclarativeTool<ReadMcpResourceToolParams, ToolResult> {
    private readonly config;
    static readonly Name: "read_mcp_resource";
    constructor(config: Config);
    /**
     * Self-managed size: the formatter already caps text at
     * MAX_MCP_RESOURCE_TEXT_CHARS and blobs at the per-call/per-turn blob
     * budget, so the scheduler's char truncation is redundant — and harmful,
     * since a long `label` (server_name:uri, up to ~5K chars each in the
     * delimiters) could push a fixed budget over and slice the nonce-framed
     * output mid-content. Exempt it, like ReadFile.
     */
    get maxOutputChars(): number;
    toAutoClassifierInput(params: ReadMcpResourceToolParams): Record<string, unknown>;
    protected createInvocation(params: ReadMcpResourceToolParams): ToolInvocation<ReadMcpResourceToolParams, ToolResult>;
}
