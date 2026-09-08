/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface ConversationRootIdentity {
    readonly configuredRoot: string;
    readonly canonicalRoot: string;
    readonly device: number;
    readonly inode: number;
    /**
     * False when the hosting filesystem does not expose inode numbers, so
     * identity cannot be proven by `dev:ino`.
     *
     * Comparisons then fall back to device, canonical path and stat shape, which
     * cannot detect a same-path replacement. That is a real reduction in
     * guarantee, but refusing to establish the root would make Conversations
     * permanently unusable on exFAT/FAT and some SMB mounts: "cannot prove
     * unchanged" is not "changed". Callers should surface this once per root.
     */
    readonly inodeVerifiable: boolean;
}
export interface ConversationDirectoryIdentity {
    readonly root: ConversationRootIdentity;
    readonly storageSessionId: string;
    readonly name: string;
    readonly canonicalPath: string;
    readonly device: number;
    readonly inode: number;
}
export type ConversationDirectoryIdentityScope = 'root' | 'child';
export type ConversationDirectoryIdentityFailureReason = 'invalid_session_id' | 'not_directory' | 'wrong_owner' | 'wrong_mode' | 'io_error' | 'identity_changed' | 'canonical_path_changed' | 'not_direct_child' | 'unexpected_identity' | 'not_empty';
export declare class ConversationDirectoryIdentityError extends Error {
    readonly scope: ConversationDirectoryIdentityScope;
    readonly reason: ConversationDirectoryIdentityFailureReason;
    readonly name = "ConversationDirectoryIdentityError";
    constructor(scope: ConversationDirectoryIdentityScope, reason: ConversationDirectoryIdentityFailureReason, cause?: unknown);
}
export declare const isSameConversationPath: (left: string, right: string) => boolean;
export declare function getConversationDirectoryName(storageSessionId: string): string;
export declare function createConversationRootIdentity(configuredRoot: string): Promise<ConversationRootIdentity>;
export declare function revalidateConversationRootIdentity(root: ConversationRootIdentity): Promise<ConversationRootIdentity>;
export declare function assertExactConversationRootIdentity(root: ConversationRootIdentity, candidate: string): Promise<ConversationRootIdentity>;
export declare function inspectConversationDirectoryIdentity(root: ConversationRootIdentity, storageSessionId: string, expected?: ConversationDirectoryIdentity): Promise<ConversationDirectoryIdentity | undefined>;
export declare function materializeConversationDirectoryIdentity(root: ConversationRootIdentity, storageSessionId: string): Promise<{
    identity: ConversationDirectoryIdentity;
    created: boolean;
}>;
