/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { TokenStorageType } from '../mcp/token-storage/types.js';
export declare const EXTENSION_GIT_CREDENTIAL_SELECTOR_FILENAME = ".qwen-extension-git-credentials.json";
export type ExtensionCredentialPersistence = 'stored' | 'one_time';
export interface GitCredential {
    username: string;
    password: string;
}
export interface ExtensionGitCredential extends GitCredential {
    persistence: ExtensionCredentialPersistence;
}
export interface ExtensionGitCredentialSelector {
    version: 1;
    backend: TokenStorageType;
    secretKey: string;
}
export interface ResolvedStoredGitCredential {
    credential: GitCredential;
    selector: ExtensionGitCredentialSelector;
}
export interface PreparedStoredGitCredential {
    storageType: TokenStorageType;
    selector: ExtensionGitCredentialSelector;
    commit(): void;
    discard(): Promise<void>;
}
export declare class ExtensionCredentialUnavailableError extends Error {
    readonly code = "extension_credential_unavailable";
    constructor(message?: string, options?: ErrorOptions);
}
export declare function resolveStoredGitCredential(extensionDir: string): Promise<ResolvedStoredGitCredential>;
export declare function removeGitCredentialSelector(extensionDir: string): Promise<void>;
export declare function writeGitCredentialSelector(extensionDir: string, selector: ExtensionGitCredentialSelector): Promise<void>;
export declare function prepareStoredGitCredential(extensionDir: string, credential: GitCredential): Promise<PreparedStoredGitCredential>;
export declare function prepareStoredGitCredentialDeletion(extensionDir: string): Promise<() => Promise<void>>;
