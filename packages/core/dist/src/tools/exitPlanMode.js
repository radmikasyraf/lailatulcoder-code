/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolConfirmationOutcome, } from './tools.js';
import { ApprovalMode } from '../config/config.js';
import { ToolDisplayNames, ToolNames } from './tool-names.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { buildSubagentPlanToolBlockedResult, isPlanRequiredTeammateContext, isPlanLifecycleToolUnavailableInSubagent, } from '../agents/runtime/subagent-plan-tool-policy.js';
import { getTeammateContext } from '../agents/team/identity.js';
import { StructuredToolError } from './priorReadEnforcement.js';
import { ToolErrorType } from './tool-error.js';
const debugLogger = createDebugLogger('EXIT_PLAN_MODE');
const exitPlanModeToolDescription = `Use this tool when you are in plan mode and have finished presenting your plan and are ready to code. This will prompt the user to exit plan mode.

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

## Before Using This Tool
Ensure your plan is complete and unambiguous:
- If you have unresolved questions about requirements or approach, use AskUserQuestion first (in earlier phases)
- The plan parameter MUST contain your actual plan content — empty strings will be rejected
- Once your plan is finalized, use THIS tool to request approval

**Important:** Do NOT use AskUserQuestion to ask "Is this plan okay?" or "Should I proceed?" - that's exactly what THIS tool does. ExitPlanMode inherently requests user approval of your plan.

## Examples
1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" - If unsure about auth method (OAuth, JWT, etc.), use AskUserQuestion first, then use exit plan mode tool after clarifying the approach.
`;
const exitPlanModeToolSchemaData = {
    name: 'exit_plan_mode',
    description: exitPlanModeToolDescription,
    parametersJsonSchema: {
        type: 'object',
        properties: {
            plan: {
                type: 'string',
                description: 'The plan you came up with, that you want to run by the user for approval. Supports markdown. The plan should be pretty concise. Must contain your actual plan content — empty strings will be rejected.',
            },
            originalRequest: {
                type: 'string',
                description: 'The original user request that prompted this plan. Restate it faithfully for a plan-required teammate leader.',
            },
            researchSummary: {
                type: 'string',
                description: 'A brief summary of the investigation and key findings gathered during plan mode for a plan-required teammate leader.',
            },
        },
        required: ['plan'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#',
    },
};
/**
 * `llmContent` prefixes that mark a successful plan-mode exit (user or
 * leader approval). The tool scheduler keys its post-execution history
 * sanitization (#6237) off these, so they must stay in lockstep with the
 * success returns in `ExitPlanModeToolInvocation.execute` /
 * `executePlanRequiredTeammate` below.
 */
export const PLAN_EXIT_APPROVED_LLM_CONTENT_PREFIXES = [
    'User approved.',
    'Leader approved.',
];
class ExitPlanModeToolInvocation extends BaseToolInvocation {
    config;
    approval;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return 'Plan:';
    }
    requiresUserInteraction() {
        // Outside plan mode, no user interaction is needed — execute() will
        // return a guidance error directly (#7671).
        if (this.config.getApprovalMode() !== ApprovalMode.PLAN) {
            return false;
        }
        return (!isPlanRequiredTeammateContext() &&
            !isPlanLifecycleToolUnavailableInSubagent(ToolNames.EXIT_PLAN_MODE));
    }
    async getDefaultPermission() {
        // Always allow at the permission layer. Plan-mode gating lives in
        // requiresUserInteraction() (forces 'ask' via permissionFlow) and
        // execute() (returns guidance error outside plan mode). A single
        // source of truth avoids duplicated conditionals (#7671).
        return 'allow';
    }
    async getConfirmationDetails(abortSignal) {
        if (isPlanRequiredTeammateContext()) {
            return super.getConfirmationDetails(abortSignal);
        }
        if (isPlanLifecycleToolUnavailableInSubagent(ToolNames.EXIT_PLAN_MODE)) {
            return super.getConfirmationDetails(abortSignal);
        }
        if (this.config.getApprovalMode() !== ApprovalMode.PLAN) {
            throw new StructuredToolError(this.outsidePlanGuidanceMessage(), ToolErrorType.EXECUTION_DENIED);
        }
        const snapshot = {
            plan: this.params.plan,
            approvalModeRevision: this.config.getApprovalModeRevision(),
            prePlanMode: this.config.getPrePlanMode(),
        };
        this.approval = undefined;
        const details = {
            type: 'plan',
            title: 'Would you like to proceed?',
            hideAlwaysAllow: true,
            plan: snapshot.plan,
            prePlanMode: snapshot.prePlanMode,
            onConfirm: async (outcome) => {
                switch (outcome) {
                    case ToolConfirmationOutcome.RestorePrevious:
                        this.approval = {
                            snapshot,
                            targetMode: snapshot.prePlanMode,
                        };
                        break;
                    case ToolConfirmationOutcome.ProceedAlways:
                        this.approval = {
                            snapshot,
                            targetMode: ApprovalMode.AUTO_EDIT,
                        };
                        break;
                    case ToolConfirmationOutcome.ProceedOnce:
                        this.approval = {
                            snapshot,
                            targetMode: ApprovalMode.DEFAULT,
                        };
                        break;
                    case ToolConfirmationOutcome.Cancel:
                        this.approval = undefined;
                        break;
                    default:
                        this.approval = undefined;
                        throw new Error(`Invalid plan approval outcome: ${String(outcome)}`);
                }
            },
        };
        return details;
    }
    async execute(signal) {
        if (isPlanLifecycleToolUnavailableInSubagent(ToolNames.EXIT_PLAN_MODE)) {
            return buildSubagentPlanToolBlockedResult(ToolNames.EXIT_PLAN_MODE, 'ExitPlanModeTool', debugLogger);
        }
        // Not in plan mode and no approval snapshot — the user may have
        // manually switched modes. Return a guidance error instead of a
        // permission deny (#7671). If there IS an approval snapshot, let the
        // stale-revision check below handle it (concurrent exit scenario).
        if (this.config.getApprovalMode() !== ApprovalMode.PLAN && !this.approval) {
            return this.errorResult(this.outsidePlanGuidanceMessage(), ToolErrorType.EXECUTION_DENIED);
        }
        const { plan, originalRequest, researchSummary } = this.params;
        if (isPlanRequiredTeammateContext()) {
            return this.executePlanRequiredTeammate(plan, originalRequest, researchSummary, signal);
        }
        const approval = this.approval;
        if (!approval) {
            return this.noActionResult('Plan execution was not approved. Remaining in plan mode.');
        }
        const { snapshot, targetMode } = approval;
        if (signal.aborted) {
            return this.noActionResult('Plan exit was cancelled. Remaining in plan mode.');
        }
        if (this.config.getApprovalMode() !== ApprovalMode.PLAN ||
            this.config.getApprovalModeRevision() !== snapshot.approvalModeRevision) {
            return this.noActionResult('Plan approval is stale because the approval mode changed. No action was taken.');
        }
        this.savePlanBestEffort(snapshot.plan);
        try {
            this.config.setApprovalMode(targetMode, {
                fromApprovedPlanExit: true,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            debugLogger.error(`[ExitPlanModeTool] Failed to set approval mode to "${targetMode}": ${message}`);
            return this.errorResult(`Failed to exit plan mode: ${message}. Remaining in plan mode.`);
        }
        return {
            llmContent: 'User approved. You can now start coding. Start with updating your todo list if applicable.',
            returnDisplay: {
                type: 'plan_summary',
                message: 'User approved.',
                plan: snapshot.plan,
            },
        };
    }
    async executePlanRequiredTeammate(plan, originalRequest, researchSummary, signal) {
        if (this.config.getApprovalMode() !== ApprovalMode.PLAN) {
            return this.errorResult('Not in plan mode — no action taken.');
        }
        const approvalModeRevision = this.config.getApprovalModeRevision();
        const teammate = getTeammateContext();
        const manager = this.config.getTeamManager();
        if (!teammate || !manager) {
            return this.errorResult('Plan-required teammate approval is unavailable in this context.');
        }
        let decision;
        try {
            decision = await manager.requestPlanApproval({
                teammateName: teammate.agentName,
                plan,
                originalRequest,
                researchSummary,
                signal,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return this.errorResult(`Failed to request leader plan approval: ${message}`);
        }
        if (signal.aborted) {
            return this.noActionResult('Leader plan approval was cancelled. Remaining in plan mode.');
        }
        if (this.config.getApprovalMode() !== ApprovalMode.PLAN ||
            this.config.getApprovalModeRevision() !== approvalModeRevision) {
            return this.noActionResult('Leader plan approval is stale because the approval mode changed. No action was taken.');
        }
        if (decision.action === 'reject') {
            const feedback = decision.message
                ? `\n\nLeader feedback:\n${decision.message}`
                : '';
            const llmContent = 'Leader rejected the plan. Revise the plan based on the feedback and call exit_plan_mode again.' +
                feedback;
            return {
                llmContent,
                returnDisplay: {
                    type: 'plan_summary',
                    message: 'Leader rejected the plan.',
                    plan: `${plan.trimEnd()}\n\n---\n\n${llmContent}`,
                    rejected: true,
                },
            };
        }
        if (decision.targetMode === ApprovalMode.PLAN) {
            return this.errorResult('Leader approval did not select an execution mode. Remaining in plan mode.');
        }
        this.savePlanBestEffort(plan);
        try {
            this.config.setApprovalMode(decision.targetMode, {
                fromApprovedPlanExit: true,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return this.errorResult(`Leader approved the plan, but failed to exit plan mode: ${message}.`);
        }
        const feedback = decision.message
            ? ` Leader note: ${decision.message}`
            : '';
        return {
            llmContent: `Leader approved.${feedback} You can now start coding. Start with updating your todo list if applicable.`,
            returnDisplay: {
                type: 'plan_summary',
                message: 'Leader approved.',
                plan,
            },
        };
    }
    outsidePlanGuidanceMessage() {
        const currentMode = this.config.getApprovalMode();
        return (`You are not in plan mode (current mode: ${currentMode}). ` +
            `The user may have manually switched modes via Shift+Tab or /approval-mode. ` +
            `Do not call exit_plan_mode again. Continue working in the current mode.`);
    }
    savePlanBestEffort(plan) {
        try {
            this.config.savePlan(plan);
        }
        catch (error) {
            debugLogger.warn(`[ExitPlanModeTool] Failed to save plan to disk: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    errorResult(message, type) {
        return {
            llmContent: message,
            returnDisplay: message,
            error: { message, type },
        };
    }
    noActionResult(message) {
        return {
            llmContent: message,
            returnDisplay: message,
        };
    }
}
export class ExitPlanModeTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.EXIT_PLAN_MODE;
    constructor(config) {
        super(ExitPlanModeTool.Name, ToolDisplayNames.EXIT_PLAN_MODE, exitPlanModeToolDescription, Kind.Think, exitPlanModeToolSchemaData.parametersJsonSchema, true, false, true, 
        // Plan mode tells the model to call exit_plan_mode directly, so its schema
        // must always be declared instead of deferred (issue #5210).
        true);
        this.config = config;
    }
    validateToolParams(params) {
        if (!params.plan ||
            typeof params.plan !== 'string' ||
            params.plan.trim() === '') {
            return 'Parameter "plan" must be a non-empty string.';
        }
        return null;
    }
    createInvocation(params) {
        return new ExitPlanModeToolInvocation(this.config, params);
    }
}
//# sourceMappingURL=exitPlanMode.js.map