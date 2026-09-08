/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseTokenStorage } from './base-token-storage.js';
import type { SecretStorage, OAuthCredentials } from './types.js';
import { TokenStorageType } from './types.js';
export declare class HybridTokenStorage extends BaseTokenStorage implements SecretStorage {
    private storage;
    private storageType;
    private storageInitPromise;
    constructor(serviceName: string);
    private initializeStorage;
    private getStorage;
    getCredentials(serverName: string): Promise<OAuthCredentials | null>;
    setCredentials(credentials: OAuthCredentials): Promise<void>;
    deleteCredentials(serverName: string): Promise<void>;
    listServers(): Promise<string[]>;
    getAllCredentials(): Promise<Map<string, OAuthCredentials>>;
    clearAll(): Promise<void>;
    getStorageType(): Promise<TokenStorageType>;
    isAvailable(): Promise<boolean>;
    setSecret(key: string, value: string): Promise<void>;
    getSecret(key: string): Promise<string | null>;
    deleteSecret(key: string): Promise<void>;
    listSecrets(): Promise<string[]>;
}
