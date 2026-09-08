/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
function abortError() {
    return new DOMException('Workflow dispatch scheduler aborted.', 'AbortError');
}
export class WorkflowDispatchScheduler {
    limit;
    signal;
    state = 'running';
    inFlight = 0;
    queue = [];
    gateWaiters = [];
    stateListeners = new Set();
    constructor(limit, signal, onStateChange) {
        this.limit = limit;
        this.signal = signal;
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error(`Workflow dispatch limit must be a positive integer, got ${String(limit)}.`);
        }
        if (onStateChange)
            this.stateListeners.add(onStateChange);
        if (signal && !signal.aborted) {
            signal.addEventListener('abort', () => this.abortPending(), {
                once: true,
            });
        }
    }
    /**
     * Subscribe to state transitions. Returns an unsubscribe function.
     * The constructor callback (when given) is registered as the first
     * listener; this method lets additional observers — e.g. the sandbox's
     * pause-aware wall-clock watchdog — hook the same transitions.
     */
    onStateChange(listener) {
        this.stateListeners.add(listener);
        return () => {
            this.stateListeners.delete(listener);
        };
    }
    run(thunk) {
        return new Promise((resolve, reject) => {
            if (this.signal?.aborted) {
                reject(abortError());
                return;
            }
            this.queue.push({
                thunk: thunk,
                resolve: resolve,
                reject,
            });
            this.pump();
        });
    }
    pause() {
        if (this.state !== 'running' || this.signal?.aborted)
            return false;
        this.setState('pausing');
        if (this.inFlight === 0)
            this.setState('paused');
        return true;
    }
    resume() {
        if (this.state !== 'paused' || this.signal?.aborted)
            return false;
        this.setState('running');
        while (this.gateWaiters.length > 0) {
            this.gateWaiters.shift().resolve();
        }
        this.pump();
        return true;
    }
    waitUntilRunning() {
        if (this.signal?.aborted)
            return Promise.reject(abortError());
        if (this.state === 'running')
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            this.gateWaiters.push({ resolve, reject });
        });
    }
    snapshot() {
        return {
            state: this.state,
            queued: this.queue.length,
            inFlight: this.inFlight,
        };
    }
    pump() {
        while (this.state === 'running' &&
            this.inFlight < this.limit &&
            this.queue.length > 0) {
            const job = this.queue.shift();
            if (this.signal?.aborted) {
                job.reject(abortError());
                continue;
            }
            this.inFlight++;
            Promise.resolve()
                .then(job.thunk)
                .then(job.resolve, job.reject)
                .finally(() => {
                this.inFlight--;
                if (this.state === 'pausing' && this.inFlight === 0) {
                    this.setState('paused');
                }
                this.pump();
            });
        }
    }
    setState(state) {
        if (this.state === state)
            return;
        this.state = state;
        const snapshot = this.snapshot();
        for (const listener of [...this.stateListeners])
            listener(snapshot);
    }
    abortPending() {
        const error = abortError();
        while (this.queue.length > 0)
            this.queue.shift().reject(error);
        while (this.gateWaiters.length > 0) {
            this.gateWaiters.shift().reject(error);
        }
    }
}
//# sourceMappingURL=workflow-dispatch-scheduler.js.map