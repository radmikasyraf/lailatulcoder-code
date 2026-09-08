/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolInvocation, ToolResult } from '../tools/tools.js';
import { BaseDeclarativeTool } from '../tools/tools.js';
import { type GoalRuntime } from './goal-runtime.js';
export interface GoalToolConfig {
    getGoalRuntime(): GoalRuntime;
}
export type GetGoalToolParams = Record<string, never>;
export interface UpdateGoalToolParams {
    status: 'complete' | 'blocked';
    reason: string;
    evidenceRefs: string[];
    blockerKind?: 'authority' | 'external' | 'repeated';
}
export type GoalToolResult = ToolResult;
export declare class GetGoalTool extends BaseDeclarativeTool<GetGoalToolParams, GoalToolResult> {
    private readonly config;
    static readonly Name: "get_goal";
    constructor(config: GoalToolConfig);
    protected createInvocation(params: GetGoalToolParams): ToolInvocation<GetGoalToolParams, GoalToolResult>;
    /**
     * The session's most recent Goal, for a turn that holds no Goal permit.
     *
     * A Goal that reached a terminal status stops issuing permits, so every
     * later `get_goal` answered `{ active: false }` — the run's own turn count,
     * elapsed time and stop reason became unreadable at exactly the moment
     * someone wanted them. The runtime still holds that record and reading it
     * needs no permit, so report it. Scalars only: the objective and the
     * evidence checkpoint stay behind the permit.
     */
    private lastGoal;
}
export declare class UpdateGoalTool extends BaseDeclarativeTool<UpdateGoalToolParams, GoalToolResult> {
    private readonly config;
    static readonly Name: "update_goal";
    constructor(config: GoalToolConfig);
    protected validateToolParamValues(params: UpdateGoalToolParams): string | null;
    protected createInvocation(params: UpdateGoalToolParams): ToolInvocation<UpdateGoalToolParams, GoalToolResult>;
}
