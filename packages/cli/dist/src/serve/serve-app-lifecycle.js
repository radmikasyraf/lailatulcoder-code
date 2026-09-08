/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { conversationRuntimeUnavailableError } from './conversations/conversation-runtime-errors.js';
const SERVE_APP_LIFECYCLE = Symbol('LailatulCoder.serveAppLifecycle');
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const SECONDARY_CLOSE_TIMEOUT_MS = 2_000;
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    void promise.catch(() => undefined);
    return { promise, resolve, reject };
}
export class ServeAppLifecycleController {
    admission = deferred();
    server;
    startupReady = true;
    listenerReady = false;
    listenerClosed = false;
    sealed = false;
    closePending;
    ownership;
    appDrain;
    hostDrain;
    bootStarter;
    bootPending;
    bootStarted = false;
    bindServer(server, options = {}) {
        if (this.server || server.listening || this.bootStarted || this.sealed) {
            throw new Error('Serve app lifecycle must bind one server before its first listen.');
        }
        this.server = server;
        this.hostDrain = options.drainHost;
        this.startupReady = options.startupReady === undefined;
        server.once('listening', () => {
            this.listenerReady = true;
            if (this.sealed) {
                server.close();
                server.closeAllConnections();
                return;
            }
            this.openAdmissionIfReady();
        });
        server.on('close', () => {
            this.listenerClosed = true;
            this.seal();
            void this.close().catch(() => undefined);
        });
        server.on('error', (error) => {
            if (!this.listenerReady && options.startupReady === undefined) {
                this.seal(error);
                void this.close().catch(() => undefined);
            }
        });
        if (options.startupReady) {
            void options.startupReady.then(() => {
                this.startupReady = true;
                this.openAdmissionIfReady();
            }, (error) => {
                this.seal(error instanceof Error ? error : new Error(String(error)));
            });
        }
    }
    close(options = {}) {
        if (this.closePending)
            return this.closePending;
        const pending = this.closeOnce(options);
        this.closePending = pending;
        void pending.catch(() => {
            if (this.closePending === pending)
                this.closePending = undefined;
        });
        return pending;
    }
    setOwnership(ownership) {
        if (this.ownership) {
            throw new Error('Serve app lifecycle ownership is already configured.');
        }
        this.ownership = ownership;
    }
    setAppDrain(drain) {
        this.appDrain = drain;
    }
    setBootStarter(starter) {
        this.bootStarter = starter;
        this.openAdmissionIfReady();
    }
    async awaitBootAdmission() {
        if (!this.server || this.sealed) {
            throw conversationRuntimeUnavailableError();
        }
        try {
            await this.admission.promise;
        }
        catch (error) {
            throw conversationRuntimeUnavailableError(error);
        }
        if (this.sealed) {
            throw conversationRuntimeUnavailableError();
        }
    }
    async startBoot(starter = this.bootStarter) {
        await this.awaitBootAdmission();
        await this.beginBoot(starter);
    }
    getBootPromise() {
        return this.bootPending;
    }
    isBootStarted() {
        return this.bootStarted;
    }
    sealBoot() {
        this.seal();
    }
    openAdmissionIfReady() {
        if (this.sealed ||
            !this.server ||
            !this.listenerReady ||
            !this.startupReady) {
            return;
        }
        this.admission.resolve();
        const bootStarter = this.bootStarter;
        if (bootStarter && !this.bootStarted) {
            void this.beginBoot(bootStarter)?.catch(() => undefined);
        }
    }
    beginBoot(starter) {
        if (!starter)
            return undefined;
        if (this.sealed) {
            return Promise.reject(conversationRuntimeUnavailableError());
        }
        if (this.bootPending)
            return this.bootPending;
        this.bootStarted = true;
        const pending = Promise.resolve().then(starter);
        const tracked = pending.finally(() => {
            if (this.bootPending === tracked)
                this.bootPending = undefined;
        });
        this.bootPending = tracked;
        void tracked.catch(() => undefined);
        return tracked;
    }
    seal(error) {
        if (this.sealed)
            return;
        this.sealed = true;
        this.admission.reject(error ?? conversationRuntimeUnavailableError());
    }
    async closeOnce(options) {
        this.seal();
        const drains = [
            this.startDrain(this.appDrain),
            this.startDrain(this.hostDrain),
            this.bootPending?.catch(() => undefined),
        ].filter((value) => value !== undefined);
        const listenerClose = this.closeListener(options.timeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS);
        const results = await Promise.allSettled([...drains, listenerClose]);
        const errors = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason);
        if (errors.length === 1) {
            throw errors[0];
        }
        if (errors.length > 1) {
            throw new AggregateError(errors, 'Serve app shutdown is incomplete.');
        }
        await this.ownership?.release();
    }
    startDrain(drain) {
        if (!drain)
            return undefined;
        try {
            return drain();
        }
        catch (error) {
            return Promise.reject(error);
        }
    }
    closeListener(timeoutMs) {
        if (!this.server ||
            this.listenerClosed ||
            (!this.listenerReady && !this.server.listening)) {
            return Promise.resolve();
        }
        const server = this.server;
        if (!server.listening) {
            return this.waitForClosingListener(server, timeoutMs);
        }
        return new Promise((resolve, reject) => {
            let secondaryTimer;
            const forceTimer = setTimeout(() => {
                server.closeAllConnections();
                secondaryTimer = setTimeout(() => {
                    reject(new Error('The serve listener did not confirm shutdown.'));
                }, SECONDARY_CLOSE_TIMEOUT_MS);
                secondaryTimer.unref();
            }, Math.max(0, timeoutMs));
            forceTimer.unref();
            server.close((error) => {
                clearTimeout(forceTimer);
                if (secondaryTimer)
                    clearTimeout(secondaryTimer);
                if (error)
                    reject(error);
                else {
                    this.listenerClosed = true;
                    resolve();
                }
            });
        });
    }
    waitForClosingListener(server, timeoutMs) {
        return new Promise((resolve, reject) => {
            let secondaryTimer;
            const onClose = () => {
                server.off('close', onClose);
                clearTimeout(forceTimer);
                if (secondaryTimer)
                    clearTimeout(secondaryTimer);
                this.listenerClosed = true;
                resolve();
            };
            const forceTimer = setTimeout(() => {
                server.closeAllConnections();
                secondaryTimer = setTimeout(() => {
                    server.off('close', onClose);
                    reject(new Error('The serve listener did not confirm shutdown.'));
                }, SECONDARY_CLOSE_TIMEOUT_MS);
                secondaryTimer.unref();
            }, Math.max(0, timeoutMs));
            forceTimer.unref();
            server.once('close', onClose);
            if (this.listenerClosed)
                onClose();
        });
    }
}
export function installServeAppLifecycle(app, lifecycle = new ServeAppLifecycleController()) {
    const locals = app.locals;
    if (locals[SERVE_APP_LIFECYCLE]) {
        throw new Error('Serve app lifecycle is already installed.');
    }
    locals[SERVE_APP_LIFECYCLE] = lifecycle;
    return lifecycle;
}
export function getServeAppLifecycle(app) {
    const lifecycle = app.locals[SERVE_APP_LIFECYCLE];
    if (!lifecycle) {
        throw new Error('Application was not created by createServeApp.');
    }
    return lifecycle;
}
export function getServeAppLifecycleController(app) {
    const lifecycle = getServeAppLifecycle(app);
    return lifecycle;
}
//# sourceMappingURL=serve-app-lifecycle.js.map