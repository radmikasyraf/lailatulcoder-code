/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * task_update tool — update an existing task's fields.
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export interface TaskUpdateParams {
    taskId: string;
    status?: 'pending' | 'in_progress' | 'completed' | 'deleted';
    owner?: string;
    subject?: string;
    description?: string;
    activeForm?: string;
    metadata?: Record<string, unknown>;
    addBlocks?: string[];
    addBlockedBy?: string[];
}
export declare class TaskUpdateTool extends BaseDeclarativeTool<TaskUpdateParams, ToolResult> {
    private config;
    static readonly Name: "task_update";
    constructor(config: Config);
    protected createInvocation(params: TaskUpdateParams): ToolInvocation<TaskUpdateParams, ToolResult>;
    /**
     * Forward the mutating fields to the classifier. Without this the
     * base `''` sentinel projects to `task_update({})` and the AUTO
     * classifier rules on an empty call — the rewritten instruction
     * text and ownership/edge changes that `'ask'` exists to inspect
     * would be invisible to it. See task-create.ts / send-message.ts.
     */
    toAutoClassifierInput(params: TaskUpdateParams): Record<string, unknown>;
}
