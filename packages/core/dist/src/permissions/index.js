/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export * from './types.js';
export * from './rule-parser.js';
export { PermissionManager } from './permission-manager.js';
export { extractShellOperations } from './shell-semantics.js';
export { applyAutoModeDecision, decorateClassifierUnavailableConfirmation, evaluateAutoMode, formatClassifierBlockMessage, formatClassifierUnavailableFallbackMessage, getAutoModePermissionDeniedReason, SAFE_TOOL_ALLOWLIST, isInSafeToolAllowlist, passesAcceptEditsFastPath, shouldFirePermissionDeniedForAutoMode, shouldClassifyAllShellForAutoMode, shouldForceAutoModeReviewForAllow, shouldRunAutoModeForCall, } from './autoMode.js';
export { AUTO_MODE_DENIAL_LIMITS, createDenialState, formatDenialStateLog, isApproveOutcome, isDenialFallbackReason, recordAllow, recordBlock, recordFallbackApprove, recordUnavailable, resetDenialState, shouldFallback, } from './denialTracking.js';
export { MAX_TRANSCRIPT_MESSAGES } from './classifier-transcript.js';
export { isDestructiveCommand, extractLastUserPrompt, registerSessionCommit, clearSessionCommits, } from './destructive-commands.js';
//# sourceMappingURL=index.js.map