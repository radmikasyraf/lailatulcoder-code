/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseTokenStorage } from './base-token-storage.js';
import type { OAuthCredentials, SecretStorage } from './types.js';
export declare class FileTokenStorage extends BaseTokenStorage implements SecretStorage {
    private readonly tokenFilePath;
    private readonly secretFilePath;
    private readonly encryptionKey;
    constructor(serviceName: string);
    private deriveEncryptionKey;
    private encrypt;
    private decrypt;
    private ensureDirectoryExists;
    private loadTokens;
    private saveTokens;
    getCredentials(serverName: string): Promise<OAuthCredentials | null>;
    setCredentials(credentials: OAuthCredentials): Promise<void>;
    deleteCredentials(serverName: string): Promise<void>;
    listServers(): Promise<string[]>;
    getAllCredentials(): Promise<Map<string, OAuthCredentials>>;
    clearAll(): Promise<void>;
    private loadSecrets;
    private saveSecrets;
    isAvailable(): Promise<boolean>;
    setSecret(key: string, value: string): Promise<void>;
    getSecret(key: string): Promise<string | null>;
    deleteSecret(key: string): Promise<void>;
    listSecrets(): Promise<string[]>;
}
