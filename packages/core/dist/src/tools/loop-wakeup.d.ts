/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
import type { Config } from '../config/config.js';
export interface LoopWakeupParams {
    delaySeconds: number;
    prompt: string;
    reason?: string;
}
export declare class LoopWakeupTool extends BaseDeclarativeTool<LoopWakeupParams, ToolResult> {
    private readonly config;
    static readonly Name: "loop_wakeup";
    constructor(config: Config);
    protected createInvocation(params: LoopWakeupParams): ToolInvocation<LoopWakeupParams, ToolResult>;
    /**
     * Forward the continuation prompt and cadence to the AUTO classifier —
     * it is enqueued and executed against the agent at fire time, so it
     * needs the same scrutiny as a direct command (mirrors CronCreate).
     */
    toAutoClassifierInput(params: LoopWakeupParams): Record<string, unknown>;
}
