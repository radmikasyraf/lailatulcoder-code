/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
/**
 * True iff `ino` can be used as proof of file identity.
 *
 * FAT/exFAT and some SMB-style filesystems do not expose inode numbers and
 * report `Stats.ino === 0` for every entry, so comparing by `dev:ino` there
 * collapses unrelated directories onto one identity.
 *
 * This restates core's `hasVerifiableInode()` rather than importing it: this
 * module is reachable from the serve pre-listen fast path, and importing the
 * core package barrel pulls its whole module graph into that bundle closure.
 */
function hasVerifiableInode(ino) {
    return Number(ino) !== 0;
}
export class ConversationDirectoryIdentityError extends Error {
    scope;
    reason;
    name = 'ConversationDirectoryIdentityError';
    constructor(scope, reason, cause) {
        // Passing the options bag through to Error keeps `cause` a non-enumerable
        // own property that exists only when one was provided; a class field
        // declaration would define an enumerable `cause: undefined` on every
        // instance instead.
        super(`Conversation ${scope} identity validation failed: ${reason}`, cause !== undefined ? { cause } : undefined);
        this.scope = scope;
        this.reason = reason;
    }
}
function throwIdentityIoError(scope, cause) {
    throw new ConversationDirectoryIdentityError(scope, 'io_error', cause);
}
export const isSameConversationPath = (left, right) => process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
export function getConversationDirectoryName(storageSessionId) {
    if (storageSessionId.length === 0 || storageSessionId.length > 256) {
        throw new ConversationDirectoryIdentityError('child', 'invalid_session_id');
    }
    return `conversation-${createHash('sha256')
        .update(storageSessionId)
        .digest('hex')}`;
}
function validateDirectoryStats(stats, scope) {
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new ConversationDirectoryIdentityError(scope, 'not_directory');
    }
    if (process.platform !== 'win32' &&
        typeof process.getuid === 'function' &&
        stats.uid !== process.getuid()) {
        throw new ConversationDirectoryIdentityError(scope, 'wrong_owner');
    }
    if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
        throw new ConversationDirectoryIdentityError(scope, 'wrong_mode');
    }
}
function hasRootIdentity(stats, root) {
    if (!root.inodeVerifiable)
        return stats.dev === root.device;
    return (hasVerifiableInode(stats.ino) &&
        stats.dev === root.device &&
        stats.ino === root.inode);
}
/**
 * True iff `before` and `after` may be treated as the same directory.
 *
 * These comparisons are the anti-swap checks around `realpath`. Where inodes
 * are available they must match; where the filesystem reports none, there is
 * nothing to compare and reporting a change would be a false positive that
 * blocks the feature outright, so only the device is required.
 */
function isSameDirectoryIdentity(before, after) {
    if (!hasVerifiableInode(before.ino) || !hasVerifiableInode(after.ino)) {
        return before.dev === after.dev;
    }
    return before.dev === after.dev && before.ino === after.ino;
}
function hasExpectedDirectoryIdentity(identity, expected) {
    const inodesProvable = hasVerifiableInode(identity.inode) && hasVerifiableInode(expected.inode);
    return (identity.storageSessionId === expected.storageSessionId &&
        identity.name === expected.name &&
        isSameConversationPath(identity.canonicalPath, expected.canonicalPath) &&
        identity.device === expected.device &&
        (!inodesProvable || identity.inode === expected.inode) &&
        isSameConversationPath(identity.root.configuredRoot, expected.root.configuredRoot) &&
        isSameConversationPath(identity.root.canonicalRoot, expected.root.canonicalRoot) &&
        identity.root.device === expected.root.device &&
        (!identity.root.inodeVerifiable ||
            !expected.root.inodeVerifiable ||
            identity.root.inode === expected.root.inode));
}
export async function createConversationRootIdentity(configuredRoot) {
    try {
        await mkdir(configuredRoot, { recursive: true, mode: 0o700 });
    }
    catch (error) {
        let existing;
        try {
            existing = await lstat(configuredRoot);
        }
        catch {
            throwIdentityIoError('root', error);
        }
        validateDirectoryStats(existing, 'root');
        throwIdentityIoError('root', error);
    }
    let before;
    try {
        before = await lstat(configuredRoot);
    }
    catch (error) {
        throwIdentityIoError('root', error);
    }
    validateDirectoryStats(before, 'root');
    let canonicalRoot;
    let after;
    try {
        canonicalRoot = await realpath(configuredRoot);
        after = await lstat(canonicalRoot);
    }
    catch (error) {
        throwIdentityIoError('root', error);
    }
    validateDirectoryStats(after, 'root');
    if (!isSameDirectoryIdentity(before, after)) {
        throw new ConversationDirectoryIdentityError('root', 'identity_changed');
    }
    return {
        configuredRoot,
        canonicalRoot,
        device: after.dev,
        inode: after.ino,
        inodeVerifiable: hasVerifiableInode(after.ino),
    };
}
export async function revalidateConversationRootIdentity(root) {
    let configuredStats;
    try {
        configuredStats = await lstat(root.configuredRoot);
    }
    catch (error) {
        throwIdentityIoError('root', error);
    }
    validateDirectoryStats(configuredStats, 'root');
    if (!hasRootIdentity(configuredStats, root)) {
        throw new ConversationDirectoryIdentityError('root', 'identity_changed');
    }
    let canonical;
    try {
        canonical = await realpath(root.configuredRoot);
    }
    catch (error) {
        throwIdentityIoError('root', error);
    }
    if (!isSameConversationPath(canonical, root.canonicalRoot)) {
        throw new ConversationDirectoryIdentityError('root', 'canonical_path_changed');
    }
    let canonicalStats;
    try {
        canonicalStats = await lstat(root.canonicalRoot);
    }
    catch (error) {
        throwIdentityIoError('root', error);
    }
    validateDirectoryStats(canonicalStats, 'root');
    if (!hasRootIdentity(canonicalStats, root)) {
        throw new ConversationDirectoryIdentityError('root', 'identity_changed');
    }
    return root;
}
export async function assertExactConversationRootIdentity(root, candidate) {
    await revalidateConversationRootIdentity(root);
    const resolvedCandidate = resolve(candidate);
    if (!isSameConversationPath(resolvedCandidate, root.configuredRoot) &&
        !isSameConversationPath(resolvedCandidate, root.canonicalRoot)) {
        throw new ConversationDirectoryIdentityError('root', 'unexpected_identity');
    }
    let stats;
    let canonical;
    try {
        stats = await lstat(resolvedCandidate);
        validateDirectoryStats(stats, 'root');
        canonical = await realpath(resolvedCandidate);
    }
    catch (error) {
        if (error instanceof ConversationDirectoryIdentityError)
            throw error;
        throwIdentityIoError('root', error);
    }
    if (!isSameConversationPath(canonical, root.canonicalRoot) ||
        !hasRootIdentity(stats, root)) {
        throw new ConversationDirectoryIdentityError('root', 'unexpected_identity');
    }
    return root;
}
export async function inspectConversationDirectoryIdentity(root, storageSessionId, expected) {
    await revalidateConversationRootIdentity(root);
    const name = getConversationDirectoryName(storageSessionId);
    const candidate = join(root.canonicalRoot, name);
    let before;
    try {
        before = await lstat(candidate);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throwIdentityIoError('child', error);
    }
    validateDirectoryStats(before, 'child');
    let canonical;
    let after;
    try {
        canonical = await realpath(candidate);
        after = await lstat(canonical);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new ConversationDirectoryIdentityError('child', 'identity_changed');
        }
        throwIdentityIoError('child', error);
    }
    validateDirectoryStats(after, 'child');
    const child = relative(root.canonicalRoot, canonical);
    if (child !== name ||
        child.includes(sep) ||
        child.startsWith('..') ||
        isAbsolute(child)) {
        throw new ConversationDirectoryIdentityError('child', 'not_direct_child');
    }
    if (!isSameDirectoryIdentity(before, after)) {
        throw new ConversationDirectoryIdentityError('child', 'identity_changed');
    }
    await revalidateConversationRootIdentity(root);
    const identity = {
        root,
        storageSessionId,
        name,
        canonicalPath: canonical,
        device: after.dev,
        inode: after.ino,
    };
    if (expected && !hasExpectedDirectoryIdentity(identity, expected)) {
        throw new ConversationDirectoryIdentityError('child', 'unexpected_identity');
    }
    return identity;
}
export async function materializeConversationDirectoryIdentity(root, storageSessionId) {
    await revalidateConversationRootIdentity(root);
    const name = getConversationDirectoryName(storageSessionId);
    const candidate = join(root.canonicalRoot, name);
    let created = false;
    try {
        await mkdir(candidate, { mode: 0o700 });
        created = true;
    }
    catch (error) {
        if (error.code !== 'EEXIST') {
            throwIdentityIoError('child', error);
        }
    }
    const identity = await inspectConversationDirectoryIdentity(root, storageSessionId);
    if (!identity) {
        throw new ConversationDirectoryIdentityError('child', 'identity_changed');
    }
    return { identity, created };
}
//# sourceMappingURL=conversation-directory-identity.js.map