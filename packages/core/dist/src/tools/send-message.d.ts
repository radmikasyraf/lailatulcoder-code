/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * send_message tool - send a message to a teammate or a background task.
 *
 * Two routing modes:
 * - Team mode: `to` matches a teammate name (or "*" for broadcast). Messages
 *   route through TeamManager. Supports structured messages like
 *   `shutdown_request`.
 * - Background-task mode: `task_id` matches an entry in the background task
 *   registry. Running tasks receive the message at the next tool-round
 *   boundary; paused recovered tasks are resumed first and take the message as
 *   their first continuation instruction.
 */
import type { Config } from '../config/config.js';
import { BaseDeclarativeTool, type ToolInvocation, type ToolResult } from './tools.js';
export interface SendMessageParams {
    /** Recipient teammate name, or "*" for broadcast (team mode). */
    to?: string;
    /** Background-task ID, from the launch response (background mode). */
    task_id?: string;
    /** Message text to send. */
    message: string;
    /** Optional 5-10 word summary for UI display (team mode). */
    summary?: string;
    /** Structured control message type (team mode). */
    type?: 'shutdown_request';
}
export declare class SendMessageTool extends BaseDeclarativeTool<SendMessageParams, ToolResult> {
    private readonly config;
    static readonly Name: "send_message";
    constructor(config: Config);
    protected createInvocation(params: SendMessageParams): ToolInvocation<SendMessageParams, ToolResult>;
    /**
     * Forward the routing fields and the message verbatim to the classifier —
     * `to`/`task_id` identify the privileged sink and the `message` itself is
     * the new instruction the recipient will execute, so the classifier needs
     * the full text to evaluate the action's safety. `type` surfaces control
     * messages (e.g. shutdown_request).
     */
    toAutoClassifierInput(params: SendMessageParams): Record<string, unknown>;
}
