/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * team_delete tool — deletes the current team and cleans up.
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export type TeamDeleteParams = Record<string, never>;
export declare class TeamDeleteTool extends BaseDeclarativeTool<TeamDeleteParams, ToolResult> {
    private config;
    static readonly Name: "team_delete";
    constructor(config: Config);
    protected createInvocation(params: TeamDeleteParams): ToolInvocation<TeamDeleteParams, ToolResult>;
}
