/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Storage } from '../config/storage.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { isNodeError } from '../utils/errors.js';
export const SESSION_START_PROFILE_ENV = 'QWEN_CODE_PROFILE_SESSION_START';
const debugLogger = createDebugLogger('SESSION_START_PROFILER');
function roundMs(value) {
    return Math.round(value * 100) / 100;
}
function getAppendProfileOpenFlags() {
    const constants = fs.constants;
    // Windows does not expose O_NOFOLLOW, so there the JSONL profile is opened
    // WITHOUT symlink protection — the lstat pre-check in
    // assertSafeExistingProfileFile is the guard that still rejects a planted link
    // before the open. That is a deliberate trade, not a no-loss fallback: the
    // previous behaviour threw here, refusing to profile on Windows at all, and
    // append-only startup diagnostics are not worth that. Key the trade on the
    // platform, not on the flag's presence: every other platform Node runs on
    // exposes O_NOFOLLOW, and `?? 0` alone would silently drop the hardening on
    // any future platform that lacked it for an unrelated reason.
    const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0);
    return ((constants.O_APPEND ?? 0) |
        (constants.O_CREAT ?? 0) |
        (constants.O_WRONLY ?? 0) |
        noFollow);
}
function assertSafeProfileDirectory(dir) {
    const dirStat = fs.lstatSync(dir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
        throw new Error('session-start profiler path must be a real directory');
    }
}
function assertSafeExistingProfileFile(filePath) {
    try {
        const fileStat = fs.lstatSync(filePath);
        if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
            throw new Error('session-start profiler path must be a real file');
        }
    }
    catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
}
function writeProfileRecord(record) {
    const dir = path.join(Storage.getRuntimeBaseDir(), 'session-start-perf');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Node does not expose a portable fd-relative append here; parent-directory
    // replacement is best-effort while O_NOFOLLOW protects the JSONL file itself.
    assertSafeProfileDirectory(dir);
    try {
        fs.chmodSync(dir, 0o700);
    }
    catch {
        // Best-effort hardening on filesystems without POSIX chmod semantics.
    }
    const filename = `session-start-${record.timestamp.slice(0, 10)}.jsonl`;
    const filePath = path.join(dir, filename);
    assertSafeExistingProfileFile(filePath);
    const fd = fs.openSync(filePath, getAppendProfileOpenFlags(), 0o600);
    try {
        if (!fs.fstatSync(fd).isFile()) {
            throw new Error('session-start profiler path must be a real file');
        }
        try {
            fs.fchmodSync(fd, 0o600);
        }
        catch {
            // Best-effort hardening; profiling output must not block startup.
        }
        fs.appendFileSync(fd, Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'), {
            flush: true,
        });
    }
    finally {
        fs.closeSync(fd);
    }
}
const disabledProfiler = {
    enabled: false,
    time(_stage, fn) {
        try {
            return Promise.resolve(fn());
        }
        catch (error) {
            return Promise.reject(error);
        }
    },
    timeSync(_stage, fn) {
        return fn();
    },
    finish() { },
};
class EnabledSessionStartProfiler {
    enabled = true;
    source;
    now;
    getTimestamp;
    writeRecord;
    sessionId;
    startMs;
    stages = {};
    failedStage;
    finished = false;
    constructor(source, options) {
        this.source = source;
        this.now = options.now;
        this.getTimestamp = options.getTimestamp;
        this.writeRecord = options.writeRecord;
        this.sessionId = options.sessionId;
        this.startMs = this.now();
    }
    async time(stage, fn) {
        const start = this.now();
        try {
            return await fn();
        }
        catch (error) {
            this.failedStage ??= stage;
            throw error;
        }
        finally {
            this.recordStage(stage, start, this.now());
        }
    }
    timeSync(stage, fn) {
        const start = this.now();
        try {
            return fn();
        }
        catch (error) {
            this.failedStage ??= stage;
            throw error;
        }
        finally {
            this.recordStage(stage, start, this.now());
        }
    }
    finish(attrs) {
        if (this.finished) {
            return;
        }
        this.finished = true;
        try {
            const record = {
                timestamp: this.getTimestamp().toISOString(),
                source: this.source,
                ok: attrs.ok,
                ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
                totalMs: roundMs(this.now() - this.startMs),
                stages: { ...this.stages },
                ...(attrs.extraHistoryLength !== undefined
                    ? { extraHistoryLength: attrs.extraHistoryLength }
                    : {}),
                ...(attrs.historyLength !== undefined
                    ? { historyLength: attrs.historyLength }
                    : {}),
                ...(attrs.snapshotEntryCount !== undefined
                    ? { snapshotEntryCount: attrs.snapshotEntryCount }
                    : {}),
                ...(attrs.deferredReminderCount !== undefined
                    ? { deferredReminderCount: attrs.deferredReminderCount }
                    : {}),
                ...(this.failedStage ? { failedStage: this.failedStage } : {}),
            };
            this.writeRecord(record);
        }
        catch (error) {
            const code = isNodeError(error) ? error.code : undefined;
            try {
                debugLogger.debug('session-start-profiler write failed', {
                    name: error instanceof Error ? error.name : typeof error,
                    message: error instanceof Error ? error.message : undefined,
                    ...(code ? { code } : {}),
                });
            }
            catch {
                // Recovery logging must not propagate into session creation.
            }
            // Profiling must never affect session creation.
        }
    }
    recordStage(stage, start, end) {
        const previous = this.stages[stage] ?? 0;
        this.stages[stage] = roundMs(previous + end - start);
    }
}
export function createSessionStartProfiler(source, options = {}) {
    const enabled = options.enabled ?? process.env[SESSION_START_PROFILE_ENV] === '1';
    if (!enabled) {
        return disabledProfiler;
    }
    try {
        debugLogger.debug('session-start-profiler enabled', { source });
    }
    catch {
        // Activation logging must not affect session startup.
    }
    return new EnabledSessionStartProfiler(source, {
        now: options.now ?? (() => performance.now()),
        getTimestamp: options.getTimestamp ?? (() => new Date()),
        writeRecord: options.writeRecord ?? writeProfileRecord,
        sessionId: options.sessionId,
    });
}
//# sourceMappingURL=session-start-profiler.js.map