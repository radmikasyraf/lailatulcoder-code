/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ConversationRuntimeOwnershipError, conversationRuntimeInUseError, conversationRuntimeOwnershipCompromisedError, conversationRuntimeUnavailableError, } from './conversation-runtime-errors.js';
const OWNER_DIRECTORY = 'conversations';
const OWNER_FILE = 'runtime-owner.json';
const OWNER_LOCK = '.runtime-owner.lock';
const MAX_OWNER_BYTES = 4 * 1024;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const DEFAULT_HANDOFF_GRACE_MS = 1_000;
class UnsafeOwnershipStateError extends Error {
}
export function getConversationRuntimeOwnerPath(stableBaseDir) {
    return path.join(stableBaseDir, OWNER_DIRECTORY, OWNER_FILE);
}
function processIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code !== 'ESRCH';
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}
function isMissing(error) {
    return error.code === 'ENOENT';
}
function assertOwnerRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new UnsafeOwnershipStateError();
    }
    const keys = Object.keys(value).sort();
    if (keys.length !== 3 ||
        keys[0] !== 'instanceNonce' ||
        keys[1] !== 'pid' ||
        keys[2] !== 'version') {
        throw new UnsafeOwnershipStateError();
    }
    const record = value;
    if (record['version'] !== 1 ||
        !Number.isSafeInteger(record['pid']) ||
        record['pid'] <= 0 ||
        typeof record['instanceNonce'] !== 'string' ||
        !NONCE_PATTERN.test(record['instanceNonce'])) {
        throw new UnsafeOwnershipStateError();
    }
    return {
        version: 1,
        pid: record['pid'],
        instanceNonce: record['instanceNonce'],
    };
}
function sameRecord(left, right) {
    return (left.version === right.version &&
        left.pid === right.pid &&
        left.instanceNonce === right.instanceNonce);
}
async function inspectDirectory(directory, requirePrivateMode) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new UnsafeOwnershipStateError();
    }
    if (process.platform !== 'win32' &&
        ((typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
            (requirePrivateMode && (stat.mode & 0o777) !== 0o700))) {
        throw new UnsafeOwnershipStateError();
    }
    return { dev: stat.dev, ino: stat.ino };
}
async function ensureDirectory(directory, requirePrivateMode) {
    try {
        return await inspectDirectory(directory, requirePrivateMode);
    }
    catch (error) {
        if (error instanceof UnsafeOwnershipStateError || !isMissing(error)) {
            throw error;
        }
    }
    const parent = path.dirname(directory);
    if (parent === directory)
        throw new UnsafeOwnershipStateError();
    const parentIdentity = await ensureDirectory(parent, false);
    await assertDirectoryIdentity(parent, parentIdentity, false);
    let created = false;
    try {
        await fs.mkdir(directory, { mode: 0o700 });
        created = true;
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
    }
    if (created && process.platform !== 'win32') {
        await fs.chmod(directory, 0o700);
    }
    await assertDirectoryIdentity(parent, parentIdentity, false);
    return inspectDirectory(directory, requirePrivateMode);
}
async function assertDirectoryIdentity(directory, expected, requirePrivateMode = true) {
    const current = await inspectDirectory(directory, requirePrivateMode);
    if (current.dev !== expected.dev || current.ino !== expected.ino) {
        throw new UnsafeOwnershipStateError();
    }
}
async function assertLockShapeIfPresent(lockPath) {
    let stat;
    try {
        stat = await fs.lstat(lockPath);
    }
    catch (error) {
        if (isMissing(error))
            return;
        throw error;
    }
    if (!stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (process.platform !== 'win32' &&
            typeof process.getuid === 'function' &&
            stat.uid !== process.getuid())) {
        throw new UnsafeOwnershipStateError();
    }
}
async function readOwnerRecord(ownerPath) {
    let pathStat;
    try {
        pathStat = await fs.lstat(ownerPath);
    }
    catch (error) {
        if (isMissing(error))
            return undefined;
        throw error;
    }
    if (!pathStat.isFile() ||
        pathStat.isSymbolicLink() ||
        pathStat.nlink !== 1 ||
        pathStat.size <= 0 ||
        pathStat.size > MAX_OWNER_BYTES ||
        (process.platform !== 'win32' &&
            ((pathStat.mode & 0o777) !== 0o600 ||
                (typeof process.getuid === 'function' &&
                    pathStat.uid !== process.getuid())))) {
        throw new UnsafeOwnershipStateError();
    }
    let handle;
    try {
        handle = await fs.open(ownerPath, process.platform === 'win32'
            ? fsConstants.O_RDONLY
            : fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    }
    catch (error) {
        if (error.code === 'ELOOP') {
            throw new UnsafeOwnershipStateError(undefined, { cause: error });
        }
        throw error;
    }
    try {
        const handleStat = await handle.stat();
        if (!handleStat.isFile() ||
            handleStat.nlink !== 1 ||
            handleStat.dev !== pathStat.dev ||
            handleStat.ino !== pathStat.ino ||
            handleStat.size !== pathStat.size ||
            (process.platform !== 'win32' &&
                ((handleStat.mode & 0o777) !== 0o600 ||
                    (typeof process.getuid === 'function' &&
                        handleStat.uid !== process.getuid())))) {
            throw new UnsafeOwnershipStateError();
        }
        const serialized = await handle.readFile('utf8');
        let parsed;
        try {
            parsed = JSON.parse(serialized);
        }
        catch (error) {
            throw new UnsafeOwnershipStateError(undefined, { cause: error });
        }
        return assertOwnerRecord(parsed);
    }
    finally {
        await handle.close();
    }
}
async function syncDirectory(directory) {
    if (process.platform === 'win32')
        return;
    const handle = await fs.open(directory, fsConstants.O_RDONLY);
    try {
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
class FileConversationRuntimeOwnership {
    stableBaseDir;
    ownerDirectory;
    ownerPath;
    lockPath;
    current;
    isProcessAlive;
    wait;
    handoffGraceMs;
    lockOptions;
    state = 'unclaimed';
    terminalError;
    acquirePending;
    releasePending;
    constructor(options) {
        this.stableBaseDir = options.stableBaseDir;
        this.ownerDirectory = path.dirname(getConversationRuntimeOwnerPath(options.stableBaseDir));
        this.ownerPath = getConversationRuntimeOwnerPath(options.stableBaseDir);
        this.lockPath = path.join(this.ownerDirectory, OWNER_LOCK);
        this.current = {
            version: 1,
            pid: options.pid,
            instanceNonce: options.instanceNonce,
        };
        this.isProcessAlive = options.isProcessAlive ?? processIsAlive;
        this.wait = options.wait ?? delay;
        this.handoffGraceMs = options.handoffGraceMs ?? DEFAULT_HANDOFF_GRACE_MS;
        this.lockOptions = options.lockOptions ?? {
            stale: 5_000,
            update: 1_000,
            retries: {
                retries: 40,
                minTimeout: 10,
                maxTimeout: 50,
                factor: 1.2,
                randomize: true,
            },
        };
    }
    acquire() {
        if (this.acquirePending)
            return this.acquirePending;
        const pending = this.acquireOnce().finally(() => {
            if (this.acquirePending === pending)
                this.acquirePending = undefined;
        });
        this.acquirePending = pending;
        return pending;
    }
    release() {
        if (this.releasePending)
            return this.releasePending;
        const pending = this.releaseOnce().finally(() => {
            if (this.releasePending === pending)
                this.releasePending = undefined;
        });
        this.releasePending = pending;
        return pending;
    }
    async acquireOnce() {
        if (this.terminalError)
            throw this.terminalError;
        if (this.state === 'released') {
            throw this.compromise();
        }
        if (this.releasePending) {
            await this.releasePending.catch(() => undefined);
            throw this.compromise();
        }
        const identity = await this.prepareOwnerDirectory();
        let releaseLock;
        let operationError;
        let reclaimed = false;
        let lockCompromise;
        try {
            await assertLockShapeIfPresent(this.lockPath);
            const lockfile = (await import('proper-lockfile')).default;
            releaseLock = await lockfile.lock(this.ownerDirectory, {
                realpath: false,
                lockfilePath: this.lockPath,
                ...this.lockOptions,
                onCompromised: (error) => {
                    lockCompromise = error;
                },
            });
            await assertLockShapeIfPresent(this.lockPath);
            await assertDirectoryIdentity(this.ownerDirectory, identity);
            if (lockCompromise)
                throw new UnsafeOwnershipStateError();
            const existing = await readOwnerRecord(this.ownerPath);
            const commitOwner = async () => {
                if (this.state === 'owned') {
                    if (!existing || !sameRecord(existing, this.current)) {
                        throw new UnsafeOwnershipStateError();
                    }
                }
                else if (existing && sameRecord(existing, this.current)) {
                    this.state = 'provisional';
                }
                else if (existing) {
                    if (existing.pid === this.current.pid ||
                        this.isProcessAlive(existing.pid)) {
                        throw conversationRuntimeInUseError();
                    }
                    reclaimed = true;
                    await this.commitRecord(identity, existing);
                }
                else {
                    await this.commitRecord(identity, undefined);
                }
            };
            const liveDiscovery = await import('../live/discovery.js');
            const handoff = await liveDiscovery.handoffLiveDiscoveryOwner(this.stableBaseDir, this.current, commitOwner, {
                isProcessAlive: this.isProcessAlive,
                waitForHandoffGrace: false,
            });
            reclaimed ||= handoff.reclaimed;
        }
        catch (error) {
            operationError = error;
        }
        let releaseError;
        if (releaseLock) {
            try {
                await releaseLock();
            }
            catch (error) {
                releaseError = error;
            }
        }
        if (lockCompromise || releaseError) {
            throw this.compromise(lockCompromise ?? releaseError);
        }
        if (operationError) {
            throw this.mapAcquireError(operationError);
        }
        if (reclaimed) {
            try {
                await this.wait(this.handoffGraceMs);
            }
            catch (error) {
                throw this.compromise(error);
            }
        }
        if (this.state === 'provisional')
            this.state = 'owned';
        return { reclaimed };
    }
    async releaseOnce() {
        if (this.acquirePending) {
            await this.acquirePending.catch(() => undefined);
        }
        if (this.state === 'unclaimed' || this.state === 'released')
            return false;
        if (this.state === 'provisional' || this.terminalError) {
            throw this.terminalError ?? this.compromise();
        }
        const identity = await this.prepareOwnerDirectory();
        let releaseLock;
        let operationError;
        let lockCompromise;
        try {
            await assertLockShapeIfPresent(this.lockPath);
            const lockfile = (await import('proper-lockfile')).default;
            releaseLock = await lockfile.lock(this.ownerDirectory, {
                realpath: false,
                lockfilePath: this.lockPath,
                ...this.lockOptions,
                onCompromised: (error) => {
                    lockCompromise = error;
                },
            });
            await assertLockShapeIfPresent(this.lockPath);
            await assertDirectoryIdentity(this.ownerDirectory, identity);
            const existing = await readOwnerRecord(this.ownerPath);
            if (lockCompromise || !existing || !sameRecord(existing, this.current)) {
                throw new UnsafeOwnershipStateError();
            }
            await assertDirectoryIdentity(this.ownerDirectory, identity);
            await fs.unlink(this.ownerPath);
            this.state = 'released';
            await syncDirectory(this.ownerDirectory);
        }
        catch (error) {
            operationError = error;
        }
        let releaseError;
        if (releaseLock) {
            try {
                await releaseLock();
            }
            catch (error) {
                releaseError = error;
            }
        }
        if (lockCompromise || releaseError) {
            if (this.state !== 'released')
                this.compromise(lockCompromise);
            throw conversationRuntimeOwnershipCompromisedError(lockCompromise ?? releaseError);
        }
        if (operationError) {
            if (this.state === 'released') {
                throw conversationRuntimeOwnershipCompromisedError(operationError);
            }
            if (operationError instanceof UnsafeOwnershipStateError) {
                throw this.compromise(operationError);
            }
            throw conversationRuntimeUnavailableError(operationError);
        }
        return true;
    }
    async prepareOwnerDirectory() {
        try {
            if (this.state === 'unclaimed') {
                await ensureDirectory(this.stableBaseDir, false);
                return await ensureDirectory(this.ownerDirectory, true);
            }
            await inspectDirectory(this.stableBaseDir, false);
            return await inspectDirectory(this.ownerDirectory, true);
        }
        catch (error) {
            if (error instanceof UnsafeOwnershipStateError ||
                (this.state !== 'unclaimed' && isMissing(error))) {
                throw this.compromise(error);
            }
            throw conversationRuntimeUnavailableError(error);
        }
    }
    async commitRecord(identity, expected) {
        const temporaryPath = path.join(this.ownerDirectory, `.runtime-owner.${this.current.pid}.${randomUUID()}.tmp`);
        let handle;
        let renamed = false;
        try {
            handle = await fs.open(temporaryPath, 'wx', 0o600);
            await handle.writeFile(`${JSON.stringify(this.current)}\n`, 'utf8');
            await handle.sync();
            if (process.platform !== 'win32')
                await handle.chmod(0o600);
            await handle.close();
            handle = undefined;
            await assertDirectoryIdentity(this.ownerDirectory, identity);
            const observed = await readOwnerRecord(this.ownerPath);
            if ((expected === undefined && observed !== undefined) ||
                (expected !== undefined &&
                    (!observed || !sameRecord(observed, expected)))) {
                throw new UnsafeOwnershipStateError();
            }
            await assertDirectoryIdentity(this.ownerDirectory, identity);
            if (process.platform === 'win32' && observed) {
                await fs.unlink(this.ownerPath);
                try {
                    await fs.rename(temporaryPath, this.ownerPath);
                }
                catch (error) {
                    await this.wait(this.handoffGraceMs);
                    throw error;
                }
            }
            else {
                await fs.rename(temporaryPath, this.ownerPath);
            }
            renamed = true;
            this.state = 'provisional';
            await syncDirectory(this.ownerDirectory);
        }
        finally {
            await handle?.close().catch(() => undefined);
            if (!renamed) {
                await fs.unlink(temporaryPath).catch(() => undefined);
            }
        }
    }
    mapAcquireError(error) {
        if (error instanceof ConversationRuntimeOwnershipError)
            return error;
        if (error instanceof Error &&
            error.name === 'LiveDiscoveryOwnerActiveError') {
            return conversationRuntimeInUseError();
        }
        if (error instanceof UnsafeOwnershipStateError) {
            return this.compromise(error);
        }
        if (this.state === 'provisional' ||
            (error instanceof Error && error.name === 'LiveDiscoveryStateError')) {
            return this.compromise(error);
        }
        const code = error.code;
        if (code === 'ECOMPROMISED')
            return this.compromise(error);
        return conversationRuntimeUnavailableError(error);
    }
    compromise(cause) {
        this.terminalError ??= conversationRuntimeOwnershipCompromisedError(cause);
        return this.terminalError;
    }
}
export function createConversationRuntimeOwnership(options) {
    if (!path.isAbsolute(options.stableBaseDir) ||
        !Number.isSafeInteger(options.pid) ||
        options.pid <= 0 ||
        !NONCE_PATTERN.test(options.instanceNonce) ||
        !Number.isSafeInteger(options.handoffGraceMs ?? DEFAULT_HANDOFF_GRACE_MS) ||
        (options.handoffGraceMs ?? DEFAULT_HANDOFF_GRACE_MS) < 0) {
        throw new TypeError('Invalid Conversations runtime ownership options.');
    }
    return new FileConversationRuntimeOwnership(options);
}
//# sourceMappingURL=conversation-runtime-ownership.js.map