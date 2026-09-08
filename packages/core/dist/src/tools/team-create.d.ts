/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * team_create tool — creates a new agent team.
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export interface TeamCreateParams {
    team_name: string;
    description?: string;
}
export declare class TeamCreateTool extends BaseDeclarativeTool<TeamCreateParams, ToolResult> {
    private config;
    static readonly Name: "team_create";
    constructor(config: Config);
    protected createInvocation(params: TeamCreateParams): ToolInvocation<TeamCreateParams, ToolResult>;
}
