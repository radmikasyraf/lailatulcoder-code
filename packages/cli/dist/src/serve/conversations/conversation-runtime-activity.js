/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
export class ConversationRuntimeActivityGate {
    sealed = false;
    active = 0;
    drain;
    async run(task) {
        if (this.sealed) {
            throw Object.assign(new Error('The daemon is draining and no longer accepts work.'), { code: 'daemon_draining' });
        }
        this.active++;
        try {
            return await task();
        }
        finally {
            this.active--;
            if (this.active === 0) {
                this.drain?.resolve();
                this.drain = undefined;
            }
        }
    }
    sealAndWait() {
        this.sealed = true;
        if (this.active === 0)
            return Promise.resolve();
        if (!this.drain) {
            let resolve;
            const promise = new Promise((done) => {
                resolve = done;
            });
            this.drain = { promise, resolve };
        }
        return this.drain.promise;
    }
}
//# sourceMappingURL=conversation-runtime-activity.js.map