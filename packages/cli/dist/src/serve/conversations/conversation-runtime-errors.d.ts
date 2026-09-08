/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export type ConversationRuntimeOwnershipErrorCode = 'conversation_runtime_in_use' | 'conversation_runtime_unavailable' | 'conversation_root_compromised' | 'conversation_runtime_ownership_compromised';
export declare class ConversationRuntimeOwnershipError extends Error {
    readonly code: ConversationRuntimeOwnershipErrorCode;
    readonly retryable: boolean;
    readonly status = 503;
    constructor(code: ConversationRuntimeOwnershipErrorCode, retryable: boolean, options?: {
        cause?: unknown;
    });
}
export declare function conversationRuntimeInUseError(): ConversationRuntimeOwnershipError;
export declare function conversationRuntimeUnavailableError(cause?: unknown): ConversationRuntimeOwnershipError;
export declare function conversationRuntimeOwnershipCompromisedError(cause?: unknown): ConversationRuntimeOwnershipError;
export declare function conversationRootCompromisedError(cause?: unknown): ConversationRuntimeOwnershipError;
