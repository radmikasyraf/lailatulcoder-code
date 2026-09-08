/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolNames } from '../../tools/tool-names.js';
import { ApprovalMode } from '../../config/approval-mode.js';
import { getTeammateContext, isTeammate } from '../team/identity.js';
import { getCurrentAgentId } from './agent-context.js';
export const SUBAGENT_PLAN_LIFECYCLE_TOOLS = new Set([
    ToolNames.ENTER_PLAN_MODE,
    ToolNames.EXIT_PLAN_MODE,
]);
export const READ_ONLY_INSPECTION_TOOLS = [
    ToolNames.READ_FILE,
    ToolNames.GREP,
    ToolNames.GLOB,
    ToolNames.LS,
    ToolNames.LSP,
    ToolNames.TOOL_SEARCH,
    ToolNames.READ_MCP_RESOURCE,
];
const PLAN_REQUIRED_TEAMMATE_PRE_APPROVAL_TOOLS = new Set([
    ToolNames.EXIT_PLAN_MODE,
    ToolNames.TASK_LIST,
    ...READ_ONLY_INSPECTION_TOOLS,
]);
const PRE_APPROVAL_TASK_CLAIM_KEYS = new Set([
    'taskId',
    'status',
    'owner',
    'addBlocks',
    'addBlockedBy',
]);
export function isSubagentLikeExecutionContext() {
    return getCurrentAgentId() !== null || isTeammate();
}
export function isPlanRequiredTeammateContext() {
    return getTeammateContext()?.planModeRequired === true;
}
export function isPlanRequiredTeammateAwaitingApproval(config) {
    return (isPlanRequiredTeammateContext() &&
        config.getApprovalMode() === ApprovalMode.PLAN);
}
export function isPlanLifecycleToolUnavailableInSubagent(toolName) {
    if (!isSubagentLikeExecutionContext())
        return false;
    if (toolName === ToolNames.ENTER_PLAN_MODE)
        return true;
    if (toolName === ToolNames.EXIT_PLAN_MODE) {
        return !isPlanRequiredTeammateContext();
    }
    return false;
}
export function shouldUsePlanOnlyReminderInSubagentContext() {
    return isSubagentLikeExecutionContext() && !isPlanRequiredTeammateContext();
}
export function isLeaderOnlyToolUnavailableInSubagent(toolName) {
    return (isSubagentLikeExecutionContext() &&
        toolName === ToolNames.TEAM_PLAN_APPROVAL);
}
export function getLeaderOnlyToolUnavailableMessage(toolName) {
    return `${toolName} is only available to the team leader. Subagents and teammates cannot approve teammate plans.`;
}
export function getPlanRequiredTeammatePreApprovalMessage(toolName) {
    return `${toolName} is not available while this plan-required teammate is waiting for leader approval. Finish investigation, call exit_plan_mode with the proposed plan, and wait for the leader to approve it before taking execution actions.`;
}
export function isPlanRequiredTeammatePreApprovalAllowedTool(toolName, params) {
    if (PLAN_REQUIRED_TEAMMATE_PRE_APPROVAL_TOOLS.has(toolName)) {
        return true;
    }
    if (toolName !== ToolNames.TASK_UPDATE) {
        return false;
    }
    return isPreApprovalClaimOnlyTaskUpdate(params);
}
function isPreApprovalClaimOnlyTaskUpdate(params) {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
        return false;
    }
    const taskParams = params;
    for (const key of Object.keys(taskParams)) {
        if (!PRE_APPROVAL_TASK_CLAIM_KEYS.has(key)) {
            return false;
        }
    }
    const agentName = getTeammateContext()?.agentName;
    return (typeof taskParams['taskId'] === 'string' &&
        taskParams['status'] === 'in_progress' &&
        (taskParams['owner'] === undefined || taskParams['owner'] === agentName) &&
        isAbsentOrEmptyArray(taskParams['addBlocks']) &&
        isAbsentOrEmptyArray(taskParams['addBlockedBy']));
}
function isAbsentOrEmptyArray(value) {
    return value === undefined || (Array.isArray(value) && value.length === 0);
}
export function getSubagentPlanToolUnavailableMessage(toolName) {
    return `${toolName} is not available inside subagents or team agents. Plan mode is owned by the caller/main session; return your plan, findings, or constraints to the caller in your normal response instead of entering or exiting plan mode.`;
}
export function buildSubagentPlanToolBlockedResult(toolName, logTag, logger) {
    const message = getSubagentPlanToolUnavailableMessage(toolName);
    logger.warn(`[${logTag}] Blocked plan lifecycle tool call from subagent: ${toolName}`);
    return {
        llmContent: message,
        returnDisplay: message,
        error: { message },
    };
}
//# sourceMappingURL=subagent-plan-tool-policy.js.map