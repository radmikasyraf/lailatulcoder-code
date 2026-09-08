/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * task_list tool — list tasks with optional filters.
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export interface TaskListParams {
    status?: 'pending' | 'in_progress' | 'completed';
    owner?: string;
    blockedBy?: string;
}
export declare class TaskListTool extends BaseDeclarativeTool<TaskListParams, ToolResult> {
    private config;
    static readonly Name: "task_list";
    constructor(config: Config);
    protected createInvocation(params: TaskListParams): ToolInvocation<TaskListParams, ToolResult>;
}
