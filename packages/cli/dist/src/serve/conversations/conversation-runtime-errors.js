/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
const DEFAULT_MESSAGES = {
    conversation_runtime_in_use: 'The Conversations runtime is owned by another daemon.',
    conversation_runtime_unavailable: 'The Conversations runtime is temporarily unavailable.',
    conversation_root_compromised: 'The Conversations root could not be verified.',
    conversation_runtime_ownership_compromised: 'The Conversations runtime ownership state could not be verified.',
};
export class ConversationRuntimeOwnershipError extends Error {
    code;
    retryable;
    status = 503;
    constructor(code, retryable, options) {
        super(DEFAULT_MESSAGES[code], options);
        this.code = code;
        this.retryable = retryable;
        this.name = 'ConversationRuntimeOwnershipError';
    }
}
export function conversationRuntimeInUseError() {
    return new ConversationRuntimeOwnershipError('conversation_runtime_in_use', true);
}
export function conversationRuntimeUnavailableError(cause) {
    return new ConversationRuntimeOwnershipError('conversation_runtime_unavailable', true, { cause });
}
export function conversationRuntimeOwnershipCompromisedError(cause) {
    return new ConversationRuntimeOwnershipError('conversation_runtime_ownership_compromised', false, { cause });
}
export function conversationRootCompromisedError(cause) {
    return new ConversationRuntimeOwnershipError('conversation_root_compromised', false, { cause });
}
//# sourceMappingURL=conversation-runtime-errors.js.map