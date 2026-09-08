/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteJSON } from '../utils/atomicFileWrite.js';
import { FileTokenStorage } from '../mcp/token-storage/file-token-storage.js';
import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import { KeychainTokenStorage } from '../mcp/token-storage/keychain-token-storage.js';
import { TokenStorageType, } from '../mcp/token-storage/types.js';
export const EXTENSION_GIT_CREDENTIAL_SELECTOR_FILENAME = '.lailatulcoder-extension-git-credentials.json';
const GIT_CREDENTIAL_SERVICE_NAME = 'LailatulCoder Ai Extension Git Credentials';
const GIT_CREDENTIAL_KEY_PREFIX = '$qwen:extension-git:v1:';
export class ExtensionCredentialUnavailableError extends Error {
    code = 'extension_credential_unavailable';
    constructor(message = 'Stored extension Git credentials are unavailable.', options) {
        super(message, options);
        this.name = 'ExtensionCredentialUnavailableError';
    }
}
const selectorPath = (extensionDir) => path.join(extensionDir, EXTENSION_GIT_CREDENTIAL_SELECTOR_FILENAME);
function createSelectedStorage(backend) {
    return backend === TokenStorageType.KEYCHAIN
        ? new KeychainTokenStorage(GIT_CREDENTIAL_SERVICE_NAME)
        : new FileTokenStorage(GIT_CREDENTIAL_SERVICE_NAME);
}
function parseSelector(content) {
    const value = JSON.parse(content);
    if (!value ||
        typeof value !== 'object' ||
        !('version' in value) ||
        value.version !== 1 ||
        !('backend' in value) ||
        !Object.values(TokenStorageType).includes(value.backend) ||
        !('secretKey' in value) ||
        typeof value.secretKey !== 'string' ||
        !value.secretKey.startsWith(GIT_CREDENTIAL_KEY_PREFIX)) {
        throw new Error('Stored extension Git credential selector is invalid.');
    }
    return value;
}
async function readSelector(extensionDir) {
    try {
        const target = selectorPath(extensionDir);
        const stats = await fs.lstat(target);
        if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 4096) {
            throw new Error('Stored extension Git credential selector is invalid.');
        }
        return parseSelector(await fs.readFile(target, 'utf8'));
    }
    catch (error) {
        if (error instanceof ExtensionCredentialUnavailableError)
            throw error;
        throw new ExtensionCredentialUnavailableError(undefined, { cause: error });
    }
}
function parseCredential(content) {
    const value = JSON.parse(content);
    if (!value ||
        typeof value !== 'object' ||
        !('username' in value) ||
        typeof value.username !== 'string' ||
        !('password' in value) ||
        typeof value.password !== 'string') {
        throw new Error('Stored extension Git credential is invalid.');
    }
    return { username: value.username, password: value.password };
}
export async function resolveStoredGitCredential(extensionDir) {
    try {
        const selector = await readSelector(extensionDir);
        const storage = createSelectedStorage(selector.backend);
        const content = await storage.getSecret(selector.secretKey);
        if (content === null)
            throw new Error('Stored secret is missing.');
        return { credential: parseCredential(content), selector };
    }
    catch (error) {
        if (error instanceof ExtensionCredentialUnavailableError)
            throw error;
        throw new ExtensionCredentialUnavailableError(undefined, { cause: error });
    }
}
export async function removeGitCredentialSelector(extensionDir) {
    await fs.rm(selectorPath(extensionDir), { force: true });
}
export async function writeGitCredentialSelector(extensionDir, selector) {
    await atomicWriteJSON(selectorPath(extensionDir), selector, {
        mode: 0o600,
        forceMode: true,
        noFollow: true,
    });
}
export async function prepareStoredGitCredential(extensionDir, credential) {
    const storage = new HybridTokenStorage(GIT_CREDENTIAL_SERVICE_NAME);
    const secretKey = `${GIT_CREDENTIAL_KEY_PREFIX}${randomUUID()}`;
    await storage.setSecret(secretKey, JSON.stringify(credential));
    const selector = {
        version: 1,
        backend: await storage.getStorageType(),
        secretKey,
    };
    try {
        await writeGitCredentialSelector(extensionDir, selector);
    }
    catch (error) {
        await storage.deleteSecret(secretKey).catch(() => undefined);
        throw error;
    }
    let committed = false;
    let discarded = false;
    return {
        storageType: selector.backend,
        selector,
        commit: () => {
            committed = true;
        },
        discard: async () => {
            if (committed || discarded)
                return;
            const selectedStorage = createSelectedStorage(selector.backend);
            await selectedStorage.deleteSecret(secretKey);
            discarded = true;
        },
    };
}
export async function prepareStoredGitCredentialDeletion(extensionDir) {
    const selector = await readSelector(extensionDir);
    return async () => {
        const storage = createSelectedStorage(selector.backend);
        await storage.deleteSecret(selector.secretKey);
    };
}
//# sourceMappingURL=extension-git-credentials.js.map