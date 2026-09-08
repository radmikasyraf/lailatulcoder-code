/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Main-thread proxy for an AsyncFzf instance hosted in a worker_threads worker.
 *
 * Same interface as `AsyncFzf<string[]>` for the subset RecursiveFileSearch
 * uses (`find()` only) so the call site in `fileSearch.ts` is a one-line
 * swap. The constructor cost — which is the actual main-thread freeze on
 * large workspaces — moves into the worker.
 *
 * Below ~5k files the constructor cost is dominated by worker spawn + IPC
 * overhead, so we keep an in-thread fallback that just instantiates AsyncFzf
 * directly. Tests pin the in-thread path explicitly via
 * `installInProcessFzfTransport()` so they don't pay worker spawn cost or
 * have to ship `dist/fzfWorker.js` to test fixtures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { AsyncFzf } from 'fzf';
import { resolveBundleDir } from '../bundlePaths.js';
/**
 * Tunable: file count at which we cut over from the in-thread fallback to
 * the worker. Below this AsyncFzf constructor finishes before worker spawn
 * + initial postMessage IPC would. The 5_000 floor was picked from the
 * fzf-bench numbers in the parent PR — at ~5k files AsyncFzf takes ~30 ms
 * on macOS Node 22, which is the same order as the worker_threads spawn
 * latency on Linux/macOS (Windows spawn is a bit slower, but still in the
 * same 30–80 ms band, and the breakeven file count there isn't very
 * different).
 */
const DEFAULT_WORKER_THRESHOLD = 5_000;
let workerThresholdOverride = null;
/** For tests: force the worker path even on tiny inputs. Returns a restorer. */
export function __setWorkerThresholdForTests(n) {
    const prev = workerThresholdOverride;
    workerThresholdOverride = n;
    return () => {
        workerThresholdOverride = prev;
    };
}
const inProcessTransport = {
    spawn(files, options) {
        // AsyncFzf constructor is synchronous. We capture any throw eagerly so
        // ready() / find() observe it identically to the worker-error path.
        let constructError = null;
        let fzf = null;
        try {
            fzf = new AsyncFzf(files, options);
        }
        catch (err) {
            constructError = err instanceof Error ? err : new Error(String(err));
        }
        return {
            async ready() {
                if (constructError)
                    throw constructError;
            },
            async find(pattern, limit) {
                if (constructError)
                    throw constructError;
                if (!fzf)
                    throw new Error('fzf not initialized');
                const results = await fzf.find(pattern);
                return limit != null ? results.slice(0, limit) : results;
            },
            async dispose() {
                fzf = null;
            },
        };
    },
};
/**
 * Locate `fzfWorker.js` on disk. Three layouts to handle:
 *   - Bundled CLI:   handle hoisted into `dist/chunks/<hash>.js`; worker at
 *                    `dist/fzfWorker.js`. `resolveBundleDir()` strips the
 *                    chunk segment for us.
 *   - tsc output:    consumed as a library; handle at
 *                    `<pkg>/dist/utils/filesearch/fzfWorkerHandle.js`,
 *                    worker sits next to it.
 *   - tsx / source:  running TS files directly (`npm run dev`). The
 *                    sibling `.js` doesn't exist on disk, so the worker
 *                    transport is unavailable and we fall back to the
 *                    in-process path. Devs hitting the @-picker on huge
 *                    workspaces will see the same brief freeze the bundled
 *                    build avoids — acceptable for a `dev` script.
 *
 * Cached after first lookup so we don't `existsSync` on every handle
 * creation.
 */
let resolvedWorkerPath;
function getWorkerScriptPath() {
    if (resolvedWorkerPath !== undefined)
        return resolvedWorkerPath;
    const candidate = path.join(resolveBundleDir(import.meta.url), 'fzfWorker.js');
    resolvedWorkerPath = fs.existsSync(candidate) ? candidate : null;
    return resolvedWorkerPath;
}
/** For tests: clear the cached worker-path lookup. */
export function __resetWorkerScriptResolutionForTests() {
    resolvedWorkerPath = undefined;
}
const workerTransport = {
    spawn(files, options) {
        const workerPath = getWorkerScriptPath();
        if (!workerPath) {
            // Should never reach this — `FzfWorkerHandle.create()` checks
            // availability before picking the worker transport. Keep the throw
            // so a future caller bypassing that gate fails loudly instead of
            // hanging waiting for a non-existent worker to send `ready`.
            throw new Error('fzf worker transport requested but fzfWorker.js was not found');
        }
        const worker = new Worker(workerPath);
        // Don't pin the Node main loop on this worker — the parent CLI process
        // should be free to exit even if the worker is mid-find. Ref'd workers
        // would otherwise block process.exit() until terminate() resolves.
        worker.unref();
        let nextReqId = 1;
        const pending = new Map();
        let readyResolve = () => { };
        let readyReject = () => { };
        const readyPromise = new Promise((res, rej) => {
            readyResolve = res;
            readyReject = rej;
        });
        let readyState = 'pending';
        worker.on('message', (msg) => {
            if (msg.type === 'ready') {
                readyState = 'ready';
                readyResolve();
                return;
            }
            if (msg.type === 'init-error') {
                readyState = 'failed';
                readyReject(new Error(`fzf worker init failed: ${msg.message}`));
                return;
            }
            if (msg.type === 'result') {
                const slot = pending.get(msg.reqId);
                if (slot) {
                    pending.delete(msg.reqId);
                    // Worker stripped `positions` to keep IPC small. Reconstruct the
                    // FzfResultItem shape with an empty positions Set so callers that
                    // type the return as Array<FzfResultItem<string>> stay happy —
                    // RecursiveFileSearch.search only reads `entry.item`.
                    slot.resolve(msg.items.map((entry) => ({
                        item: entry.item,
                        positions: new Set(),
                        start: 0,
                        end: 0,
                        score: 0,
                    })));
                }
                return;
            }
            if (msg.type === 'find-error') {
                const slot = pending.get(msg.reqId);
                if (slot) {
                    pending.delete(msg.reqId);
                    slot.reject(new Error(msg.message));
                }
                return;
            }
        });
        const failAll = (err) => {
            if (readyState === 'pending') {
                readyReject(err);
            }
            if (readyState !== 'disposed') {
                readyState = 'failed';
            }
            for (const slot of pending.values()) {
                slot.reject(err);
            }
            pending.clear();
        };
        worker.on('error', (err) => {
            failAll(err instanceof Error ? err : new Error(String(err)));
        });
        worker.on('exit', (code) => {
            if (readyState === 'disposed')
                return; // expected exit
            failAll(new Error(`fzf worker exited unexpectedly (code=${code})`));
        });
        // Kick off init. The first `find()` will await readyPromise.
        worker.postMessage({ type: 'init', files, options });
        return {
            ready() {
                return readyPromise;
            },
            async find(pattern, limit) {
                if (readyState === 'disposed' || readyState === 'failed') {
                    throw new Error(`fzf worker not available (${readyState})`);
                }
                await readyPromise;
                const reqId = nextReqId++;
                return new Promise((resolve, reject) => {
                    if (readyState === 'disposed' || readyState === 'failed') {
                        reject(new Error(`fzf worker not available (${readyState})`));
                        return;
                    }
                    pending.set(reqId, { resolve, reject });
                    try {
                        worker.postMessage({ type: 'find', reqId, pattern, limit });
                    }
                    catch (err) {
                        pending.delete(reqId);
                        reject(err instanceof Error ? err : new Error(String(err)));
                    }
                });
            },
            async dispose() {
                readyState = 'disposed';
                try {
                    worker.postMessage({ type: 'dispose' });
                }
                catch {
                    // Worker may already be gone; terminate() below covers it.
                }
                await worker.terminate();
                for (const slot of pending.values()) {
                    slot.reject(new Error('fzf worker disposed'));
                }
                pending.clear();
            },
        };
    },
};
let transportOverride = null;
/**
 * Test/sandbox helper: route all FzfWorkerHandle.create() calls through the
 * in-thread fallback regardless of file count. Returns a restorer function
 * the caller MUST run in afterAll/afterEach to avoid leaking the override
 * into other test files (the very pitfall the parent PR's test-setup.ts
 * tripped on — see wenshao 04-21 review on PR #3455).
 */
export function installInProcessFzfTransport() {
    const prev = transportOverride;
    transportOverride = inProcessTransport;
    return () => {
        transportOverride = prev;
    };
}
export class FzfWorkerHandle {
    inst;
    constructor(inst) {
        this.inst = inst;
    }
    static async create(files, options) {
        const threshold = workerThresholdOverride ?? DEFAULT_WORKER_THRESHOLD;
        let transport;
        if (transportOverride) {
            transport = transportOverride;
        }
        else if (files.length >= threshold && getWorkerScriptPath() !== null) {
            transport = workerTransport;
        }
        else {
            transport = inProcessTransport;
        }
        const inst = transport.spawn(files, options);
        const timeoutMs = Math.max(10_000, files.length / 10);
        let timerId;
        try {
            await Promise.race([
                inst.ready(),
                new Promise((_, rej) => {
                    timerId = setTimeout(() => rej(new Error(`fzf worker init timed out after ${timeoutMs}ms (${files.length} files)`)), timeoutMs);
                }),
            ]);
        }
        catch (err) {
            await inst.dispose();
            throw err;
        }
        finally {
            if (timerId !== undefined)
                clearTimeout(timerId);
        }
        return new FzfWorkerHandle(inst);
    }
    find(pattern, limit) {
        return this.inst.find(pattern, limit);
    }
    dispose() {
        return this.inst.dispose();
    }
}
//# sourceMappingURL=fzfWorkerHandle.js.map