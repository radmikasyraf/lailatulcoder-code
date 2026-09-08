/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApprovalMode } from '../config/config.js';
import { isSubagentLikeExecutionContext } from '../agents/runtime/subagent-plan-tool-policy.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, } from './tools.js';
import { ToolDisplayNames, ToolNames } from './tool-names.js';
class TeamPlanApprovalInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return `${this.params.action} teammate plan ${this.params.request_id}`;
    }
    async getDefaultPermission() {
        return 'allow';
    }
    async execute(_signal) {
        if (isSubagentLikeExecutionContext()) {
            const msg = 'Only the team leader can approve teammate plans.';
            return {
                llmContent: msg,
                returnDisplay: msg,
                error: { message: msg },
            };
        }
        const manager = this.config.getTeamManager();
        if (!manager) {
            const msg = 'No active team. Create a team first.';
            return {
                llmContent: msg,
                returnDisplay: msg,
                error: { message: msg },
            };
        }
        try {
            if (this.params.action === 'approve') {
                const targetMode = this.getApprovalTargetMode();
                if (targetMode === ApprovalMode.PLAN) {
                    const msg = 'Cannot approve teammate plan while the leader is still in plan mode. Exit the leader plan mode first; the request remains pending.';
                    return {
                        llmContent: msg,
                        returnDisplay: msg,
                        error: { message: msg },
                    };
                }
                manager.resolvePlanApprovalRequest(this.params.request_id, {
                    action: 'approve',
                    targetMode,
                    message: this.params.message,
                });
                const msg = `Teammate plan request "${this.params.request_id}" approved.`;
                return { llmContent: msg, returnDisplay: msg };
            }
            manager.resolvePlanApprovalRequest(this.params.request_id, {
                action: 'reject',
                message: this.params.message,
            });
            const msg = `Teammate plan request "${this.params.request_id}" rejected.`;
            return { llmContent: msg, returnDisplay: msg };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Failed to resolve teammate plan approval: ${message}`,
                returnDisplay: `Plan approval failed: ${message}`,
                error: { message },
            };
        }
    }
    getApprovalTargetMode() {
        const current = this.config.getApprovalMode();
        if (current === ApprovalMode.AUTO) {
            return ApprovalMode.DEFAULT;
        }
        if (!this.config.isTrustedFolder() &&
            (current === ApprovalMode.AUTO_EDIT || current === ApprovalMode.YOLO)) {
            return ApprovalMode.DEFAULT;
        }
        return current;
    }
}
export class TeamPlanApprovalTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.TEAM_PLAN_APPROVAL;
    constructor(config) {
        super(TeamPlanApprovalTool.Name, ToolDisplayNames.TEAM_PLAN_APPROVAL, 'Approve or reject a plan submitted by a plan-required teammate. Only the team leader can use this tool.', Kind.Think, {
            type: 'object',
            properties: {
                request_id: {
                    type: 'string',
                    description: 'The request id from the team plan approval request.',
                },
                action: {
                    type: 'string',
                    enum: ['approve', 'reject'],
                    description: 'Approve or reject the teammate plan.',
                },
                message: {
                    type: 'string',
                    description: 'Optional feedback for the teammate, especially when rejecting.',
                },
            },
            required: ['request_id', 'action'],
            additionalProperties: false,
        });
        this.config = config;
    }
    validateToolParams(params) {
        if (!params.request_id ||
            typeof params.request_id !== 'string' ||
            params.request_id.trim() === '') {
            return 'Parameter "request_id" must be a non-empty string.';
        }
        if (params.action !== 'approve' && params.action !== 'reject') {
            return 'Parameter "action" must be "approve" or "reject".';
        }
        if (params.message !== undefined && typeof params.message !== 'string') {
            return 'Parameter "message" must be a string when set.';
        }
        return null;
    }
    createInvocation(params) {
        return new TeamPlanApprovalInvocation(this.config, params);
    }
}
//# sourceMappingURL=team-plan-approval.js.map