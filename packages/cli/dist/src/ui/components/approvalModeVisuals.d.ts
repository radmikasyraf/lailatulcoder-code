/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApprovalMode } from '@lailatul-coder/lailatul-coder-core';
export declare function getApprovalModeIndicatorColor(approvalMode: ApprovalMode): string | undefined;
export declare function getApprovalModePromptStyle(approvalMode: ApprovalMode): {
    color?: string;
    prefix: '>' | '*';
};
