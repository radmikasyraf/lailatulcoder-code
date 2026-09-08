/**
 * cron_delete tool — deletes a cron job by ID (in-session or durable).
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export interface CronDeleteParams {
    id: string;
}
export declare class CronDeleteTool extends BaseDeclarativeTool<CronDeleteParams, ToolResult> {
    private config;
    static readonly Name: "cron_delete";
    constructor(config: Config);
    protected createInvocation(params: CronDeleteParams): ToolInvocation<CronDeleteParams, ToolResult>;
}
