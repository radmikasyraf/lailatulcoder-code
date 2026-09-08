/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * task_create tool — create a new task in the team task list.
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export interface TaskCreateParams {
    subject: string;
    description: string;
    activeForm?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Truncate a task description for the interactive confirmation dialog.
 * Descriptions can be up to 10KB; the dialog needs enough to judge the
 * instruction, not the whole payload.
 */
export declare function truncateForConfirmation(text: string): string;
export declare class TaskCreateTool extends BaseDeclarativeTool<TaskCreateParams, ToolResult> {
    private config;
    static readonly Name: "task_create";
    constructor(config: Config);
    protected createInvocation(params: TaskCreateParams): ToolInvocation<TaskCreateParams, ToolResult>;
    /**
     * Forward the task content to the classifier. The base sentinel `''`
     * projects to an empty args object, so without this override the AUTO
     * classifier rules on `task_create({})` — the injected payload that
     * `getDefaultPermission() === 'ask'` exists to inspect would be
     * invisible to it. Mirrors `send_message`'s projection.
     */
    toAutoClassifierInput(params: TaskCreateParams): Record<string, unknown>;
}
