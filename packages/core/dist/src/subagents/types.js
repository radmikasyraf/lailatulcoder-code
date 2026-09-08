/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Subagent-only permission mode. NOT a member of the global `ApprovalMode`
 * enum (adding it there would surface it in the session model/approval
 * pickers, where it has no meaning). Valid only on a subagent definition's
 * {@link SubagentConfig.approvalMode}: it resolves to `'default'` run behavior
 * (tool calls require confirmation) and, for an interactive background run,
 * surfaces those confirmations to the parent session instead of auto-denying.
 */
export const BUBBLE_APPROVAL_MODE = 'bubble';
/**
 * Error thrown when a subagent operation fails.
 */
export class SubagentError extends Error {
    code;
    subagentName;
    constructor(message, code, subagentName) {
        super(message);
        this.code = code;
        this.subagentName = subagentName;
        this.name = 'SubagentError';
    }
}
/**
 * Error codes for subagent operations.
 */
export const SubagentErrorCode = {
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    INVALID_CONFIG: 'INVALID_CONFIG',
    INVALID_NAME: 'INVALID_NAME',
    FILE_ERROR: 'FILE_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
};
//# sourceMappingURL=types.js.map