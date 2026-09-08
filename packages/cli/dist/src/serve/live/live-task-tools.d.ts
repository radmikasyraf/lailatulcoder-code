/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { LIVE_TASK_TOOL_NAMES, type LiveTaskToolName } from '@lailatul-coder/acp-bridge/bridgeOptions';
import { BaseDeclarativeTool, Kind, type ToolInvocation, type ToolResult } from '@lailatul-coder/lailatul-coder-core';
export { LIVE_TASK_TOOL_NAMES, type LiveTaskToolName };
export type LiveTaskToolParams = Record<string, unknown>;
export type LiveTaskToolExecutor = (name: LiveTaskToolName, params: LiveTaskToolParams) => Promise<Record<string, unknown>>;
interface LiveTaskToolSpec {
    name: LiveTaskToolName;
    displayName: string;
    description: string;
    kind: Kind;
    parameters: Record<string, unknown>;
}
export declare class LiveTaskTool extends BaseDeclarativeTool<LiveTaskToolParams, ToolResult> {
    private readonly spec;
    private readonly executeTaskTool;
    constructor(spec: LiveTaskToolSpec, executeTaskTool: LiveTaskToolExecutor);
    protected createInvocation(params: LiveTaskToolParams): ToolInvocation<LiveTaskToolParams, ToolResult>;
}
export declare function createLiveTaskTools(execute: LiveTaskToolExecutor): readonly LiveTaskTool[];
