/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { BaseTokenStorage } from './base-token-storage.js';
import { Storage } from '../../config/storage.js';
import { atomicWriteFile } from '../../utils/atomicFileWrite.js';
export class FileTokenStorage extends BaseTokenStorage {
    tokenFilePath;
    secretFilePath;
    encryptionKey;
    constructor(serviceName) {
        super(serviceName);
        const configDir = Storage.getGlobalQwenDir();
        this.tokenFilePath = path.join(configDir, 'mcp-oauth-tokens-v2.json');
        this.secretFilePath = path.join(configDir, 'extension-secrets-v1.json');
        this.encryptionKey = this.deriveEncryptionKey();
    }
    deriveEncryptionKey() {
        const salt = `${os.hostname()}-${os.userInfo().username}-lailatul-coder`;
        return crypto.scryptSync('lailatul-coder-oauth', salt, 32);
    }
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    }
    decrypt(encryptedData) {
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    async ensureDirectoryExists() {
        const dir = path.dirname(this.tokenFilePath);
        await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    }
    async loadTokens(allowMissing = false) {
        try {
            const data = await fs.readFile(this.tokenFilePath, 'utf-8');
            const decrypted = this.decrypt(data);
            const tokens = JSON.parse(decrypted);
            return new Map(Object.entries(tokens));
        }
        catch (error) {
            const err = error;
            if (err.code === 'ENOENT') {
                if (allowMissing) {
                    return new Map();
                }
                throw new Error('Token file does not exist');
            }
            if (err.message?.includes('Invalid encrypted data format') ||
                err.message?.includes('Unsupported state or unable to authenticate data')) {
                throw new Error('Token file corrupted');
            }
            throw error;
        }
    }
    async saveTokens(tokens) {
        await this.ensureDirectoryExists();
        const data = Object.fromEntries(tokens);
        const json = JSON.stringify(data, null, 2);
        const encrypted = this.encrypt(json);
        await atomicWriteFile(this.tokenFilePath, encrypted, {
            mode: 0o600,
            forceMode: true,
            noFollow: true,
        });
    }
    async getCredentials(serverName) {
        const tokens = await this.loadTokens();
        const credentials = tokens.get(serverName);
        if (!credentials) {
            return null;
        }
        if (this.isTokenExpired(credentials)) {
            return null;
        }
        return credentials;
    }
    async setCredentials(credentials) {
        this.validateCredentials(credentials);
        const tokens = await this.loadTokens(true);
        const updatedCredentials = {
            ...credentials,
            updatedAt: Date.now(),
        };
        tokens.set(credentials.serverName, updatedCredentials);
        await this.saveTokens(tokens);
    }
    async deleteCredentials(serverName) {
        const tokens = await this.loadTokens();
        if (!tokens.has(serverName)) {
            throw new Error(`No credentials found for ${serverName}`);
        }
        tokens.delete(serverName);
        if (tokens.size === 0) {
            try {
                await fs.unlink(this.tokenFilePath);
            }
            catch (error) {
                const err = error;
                if (err.code !== 'ENOENT') {
                    throw error;
                }
            }
        }
        else {
            await this.saveTokens(tokens);
        }
    }
    async listServers() {
        const tokens = await this.loadTokens();
        return Array.from(tokens.keys());
    }
    async getAllCredentials() {
        const tokens = await this.loadTokens();
        const result = new Map();
        for (const [serverName, credentials] of tokens) {
            if (!this.isTokenExpired(credentials)) {
                result.set(serverName, credentials);
            }
        }
        return result;
    }
    async clearAll() {
        try {
            await fs.unlink(this.tokenFilePath);
        }
        catch (error) {
            const err = error;
            if (err.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    async loadSecrets() {
        try {
            const data = await fs.readFile(this.secretFilePath, 'utf-8');
            return JSON.parse(this.decrypt(data));
        }
        catch (error) {
            const err = error;
            if (err.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }
    async saveSecrets(secrets) {
        await this.ensureDirectoryExists();
        const encrypted = this.encrypt(JSON.stringify(secrets));
        await atomicWriteFile(this.secretFilePath, encrypted, {
            mode: 0o600,
            forceMode: true,
            noFollow: true,
        });
    }
    // The encrypted file is always usable, so the file backend is always available.
    async isAvailable() {
        return true;
    }
    async setSecret(key, value) {
        const secrets = await this.loadSecrets();
        (secrets[this.serviceName] ??= {})[key] = value;
        await this.saveSecrets(secrets);
    }
    async getSecret(key) {
        const secrets = await this.loadSecrets();
        return secrets[this.serviceName]?.[key] ?? null;
    }
    // Idempotent: deleting a missing secret is a no-op (the keychain backend
    // throws, but extension-settings callers do not depend on that signal).
    async deleteSecret(key) {
        const secrets = await this.loadSecrets();
        const bucket = secrets[this.serviceName];
        if (!bucket || !(key in bucket)) {
            return;
        }
        delete bucket[key];
        if (Object.keys(bucket).length === 0) {
            delete secrets[this.serviceName];
        }
        await this.saveSecrets(secrets);
    }
    async listSecrets() {
        const secrets = await this.loadSecrets();
        return Object.keys(secrets[this.serviceName] ?? {});
    }
}
//# sourceMappingURL=file-token-storage.js.map