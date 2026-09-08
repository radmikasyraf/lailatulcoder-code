/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { readdir, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { assertExactConversationRootIdentity, ConversationDirectoryIdentityError, createConversationRootIdentity, inspectConversationDirectoryIdentity, materializeConversationDirectoryIdentity, revalidateConversationRootIdentity, } from '../../utils/conversation-directory-identity.js';
import { normalizeSessionIdForLookup } from '../../config/session-id.js';
function liveIdentityError(error, exactRoot = false, creatingRoot = false) {
    if (!(error instanceof ConversationDirectoryIdentityError))
        throw error;
    if (error.reason === 'io_error' && error.cause !== undefined) {
        throw error.cause;
    }
    if (error.scope === 'root') {
        switch (error.reason) {
            case 'not_directory':
                throw new Error('Live conversation root must be a non-symlink directory');
            case 'wrong_owner':
                throw new Error('Live conversation root must be owned by the daemon user');
            case 'wrong_mode':
                throw new Error('Live conversation root must be accessible only to its owner');
            case 'canonical_path_changed':
                throw new Error('Live conversation root canonical path changed');
            case 'identity_changed':
                throw new Error(creatingRoot
                    ? 'Live conversation root identity changed during validation'
                    : 'Live conversation root identity changed');
            case 'unexpected_identity':
                if (exactRoot) {
                    throw new Error('Workspace must be the exact Live conversation root');
                }
                throw new Error('Live conversation root identity changed');
            default:
                throw new Error('Live conversation root identity changed');
        }
    }
    switch (error.reason) {
        case 'invalid_session_id':
            throw new Error('Live conversation session id is invalid');
        case 'not_directory':
            throw new Error('Live conversation directory must be a non-symlink directory');
        case 'wrong_owner':
            throw new Error('Live conversation directory must be owned by the daemon user');
        case 'wrong_mode':
            throw new Error('Live conversation directory must be accessible only to its owner');
        default:
            throw new Error('Live conversation directory must be an owned direct child');
    }
}
export function getConversationRootPath(homeDir = homedir()) {
    return resolve(homeDir, 'Documents', 'LailatulCoder Ai', 'Conversations');
}
export async function revalidateConversationRoot(root) {
    try {
        return await revalidateConversationRootIdentity(root);
    }
    catch (error) {
        liveIdentityError(error);
    }
}
export async function assertExactConversationRoot(root, candidate) {
    try {
        return await assertExactConversationRootIdentity(root, candidate);
    }
    catch (error) {
        liveIdentityError(error, true);
    }
}
export class ConversationWorkspace {
    rootPath;
    rootPromise;
    constructor(options = {}) {
        this.rootPath = getConversationRootPath(options.homeDir);
    }
    getRootIdentity() {
        if (!this.rootPromise) {
            const pending = createConversationRootIdentity(this.rootPath);
            this.rootPromise = pending;
            void pending.catch(() => {
                if (this.rootPromise === pending)
                    this.rootPromise = undefined;
            });
        }
        return this.rootPromise;
    }
    async getRoot() {
        try {
            return await this.getRootIdentity();
        }
        catch (error) {
            liveIdentityError(error, false, true);
        }
    }
    async revalidateStandaloneRoot() {
        return revalidateConversationRootIdentity(await this.getRootIdentity());
    }
    async revalidate() {
        return revalidateConversationRoot(await this.getRoot());
    }
    async assertExactRoot(candidate) {
        return assertExactConversationRoot(await this.getRoot(), candidate);
    }
    /**
     * The private directory is derived from the canonical session id, not from
     * whatever spelling a caller happens to hold.
     *
     * `getConversationDirectoryName()` is a case-sensitive hash, and callers reach
     * these methods with a mix of request ids, live-entry ids and ids echoed back
     * from tool arguments. Canonicalizing here makes one session resolve to one
     * directory by construction instead of leaving it to every call site.
     */
    directoryKey(sessionId) {
        return normalizeSessionIdForLookup(sessionId);
    }
    async materializeConversationDirectory(sessionId) {
        const root = await this.revalidate();
        try {
            return (await materializeConversationDirectoryIdentity(root, this.directoryKey(sessionId))).identity.canonicalPath;
        }
        catch (error) {
            liveIdentityError(error);
        }
    }
    async discardEmptyConversationDirectory(sessionId) {
        const root = await this.revalidate();
        let identity;
        try {
            identity = await inspectConversationDirectoryIdentity(root, this.directoryKey(sessionId));
        }
        catch (error) {
            liveIdentityError(error);
        }
        if (!identity)
            return false;
        try {
            await rmdir(identity.canonicalPath);
        }
        catch (error) {
            if (error.code === 'ENOENT' ||
                error.code === 'ENOTEMPTY') {
                return false;
            }
            throw error;
        }
        await revalidateConversationRoot(root);
        return true;
    }
    async prepareStandaloneDirectory(storageSessionId) {
        const root = await this.revalidateStandaloneRoot();
        const prepared = await materializeConversationDirectoryIdentity(root, storageSessionId);
        const identity = await inspectConversationDirectoryIdentity(root, storageSessionId, prepared.identity);
        if (!identity) {
            throw new ConversationDirectoryIdentityError('child', 'identity_changed');
        }
        // Entries are read after the final identity re-inspection so a same-uid
        // entry appearing across the inspect cannot slip past the emptiness
        // verdict on a stale snapshot.
        let entries;
        try {
            entries = await readdir(identity.canonicalPath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new ConversationDirectoryIdentityError('child', 'identity_changed');
            }
            throw new ConversationDirectoryIdentityError('child', 'io_error', error);
        }
        if (entries.length > 0) {
            throw new ConversationDirectoryIdentityError('child', 'not_empty');
        }
        return { identity, created: prepared.created };
    }
    async inspectStandaloneDirectory(storageSessionId, expected) {
        const root = await this.revalidateStandaloneRoot();
        try {
            const identity = await inspectConversationDirectoryIdentity(root, storageSessionId, expected);
            return identity ? { status: 'ready', identity } : { status: 'missing' };
        }
        catch (error) {
            if (error instanceof ConversationDirectoryIdentityError &&
                error.scope === 'child') {
                return { status: 'compromised', error };
            }
            throw error;
        }
    }
    async ensureStandaloneDirectory(storageSessionId, expected) {
        const inspected = await this.inspectStandaloneDirectory(storageSessionId, expected);
        if (inspected.status !== 'missing')
            return inspected;
        const root = await this.revalidateStandaloneRoot();
        try {
            const materialized = await materializeConversationDirectoryIdentity(root, storageSessionId);
            if (!materialized.created) {
                // The directory appeared inside the race window, so it is adopted
                // only through the same inspection verdict as one found up front —
                // never as a blind 'ready' carrying whatever the racing creator put
                // there.
                const raced = await this.inspectStandaloneDirectory(storageSessionId, expected);
                if (raced.status !== 'missing')
                    return raced;
                throw new ConversationDirectoryIdentityError('child', 'identity_changed');
            }
            // 'recreated' is reserved for a directory that vanished after its
            // identity was captured; a first-ever creation reports 'created'.
            return {
                status: expected ? 'recreated' : 'created',
                identity: materialized.identity,
            };
        }
        catch (error) {
            if (error instanceof ConversationDirectoryIdentityError &&
                error.scope === 'child') {
                return { status: 'compromised', error };
            }
            throw error;
        }
    }
}
//# sourceMappingURL=conversation-workspace.js.map