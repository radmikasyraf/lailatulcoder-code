/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { ConversationDirectoryIdentityError, type ConversationDirectoryIdentity, type ConversationRootIdentity } from '../../utils/conversation-directory-identity.js';
export type { ConversationRootIdentity } from '../../utils/conversation-directory-identity.js';
export interface ConversationWorkspaceOptions {
    homeDir?: string;
}
export type StandaloneDirectoryInspection = {
    status: 'ready';
    identity: ConversationDirectoryIdentity;
} | {
    status: 'missing';
} | {
    status: 'compromised';
    error: ConversationDirectoryIdentityError;
};
export type StandaloneDirectoryEnsureResult = {
    status: 'ready';
    identity: ConversationDirectoryIdentity;
} | {
    status: 'created';
    identity: ConversationDirectoryIdentity;
} | {
    status: 'recreated';
    identity: ConversationDirectoryIdentity;
} | {
    status: 'compromised';
    error: ConversationDirectoryIdentityError;
};
export declare function getConversationRootPath(homeDir?: string): string;
export declare function revalidateConversationRoot(root: ConversationRootIdentity): Promise<ConversationRootIdentity>;
export declare function assertExactConversationRoot(root: ConversationRootIdentity, candidate: string): Promise<ConversationRootIdentity>;
export declare class ConversationWorkspace {
    readonly rootPath: string;
    private rootPromise?;
    constructor(options?: ConversationWorkspaceOptions);
    private getRootIdentity;
    getRoot(): Promise<ConversationRootIdentity>;
    private revalidateStandaloneRoot;
    revalidate(): Promise<ConversationRootIdentity>;
    assertExactRoot(candidate: string): Promise<ConversationRootIdentity>;
    /**
     * The private directory is derived from the canonical session id, not from
     * whatever spelling a caller happens to hold.
     *
     * `getConversationDirectoryName()` is a case-sensitive hash, and callers reach
     * these methods with a mix of request ids, live-entry ids and ids echoed back
     * from tool arguments. Canonicalizing here makes one session resolve to one
     * directory by construction instead of leaving it to every call site.
     */
    private directoryKey;
    materializeConversationDirectory(sessionId: string): Promise<string>;
    discardEmptyConversationDirectory(sessionId: string): Promise<boolean>;
    prepareStandaloneDirectory(storageSessionId: string): Promise<{
        identity: ConversationDirectoryIdentity;
        created: boolean;
    }>;
    inspectStandaloneDirectory(storageSessionId: string, expected?: ConversationDirectoryIdentity): Promise<StandaloneDirectoryInspection>;
    ensureStandaloneDirectory(storageSessionId: string, expected?: ConversationDirectoryIdentity): Promise<StandaloneDirectoryEnsureResult>;
}
