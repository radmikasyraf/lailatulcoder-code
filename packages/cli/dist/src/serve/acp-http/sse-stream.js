/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { writeStderrLine } from '../../utils/stdioHelpers.js';
/**
 * A long-lived Server-Sent-Events writer for the ACP-over-HTTP transport.
 *
 * Unlike the REST `/session/:id/events` stream (LailatulCoder event envelopes), the
 * ACP transport carries raw JSON-RPC 2.0 objects as the SSE `data:` payload
 * — one object per frame. The RFD keeps these streams open for the life of
 * the connection/session, so the writer must:
 *   - serialize writes through a single chain (heartbeat can't interleave),
 *   - respect backpressure (`res.write` → false ⇒ await `drain`),
 *   - emit periodic comment heartbeats to keep NAT/proxies alive.
 *
 * This mirrors the battle-tested pattern in `server.ts`'s SSE handler,
 * including the optional ring-buffer `id:` sequencing that drives
 * `Last-Event-ID` resume (see `docs/design/daemon-acp-http/sse-resumable-stream.md`).
 */
export class SseStream {
    res;
    onClose;
    onHeartbeat;
    kind = 'sse';
    writeChain = Promise.resolve();
    heartbeat;
    closed = false;
    cleanupFn;
    activeWriteClosers = new Set();
    constructor(res, onClose, 
    /**
     * Fired on each heartbeat tick while the stream is open. Used to mark the
     * connection active so a long-running prompt that emits no intermediate
     * frames for >30 min isn't reaped by the idle-TTL sweep.
     */
    onHeartbeat) {
        this.res = res;
        this.onClose = onClose;
        this.onHeartbeat = onHeartbeat;
    }
    /** Write SSE headers + retry hint and start the heartbeat. */
    open() {
        this.res.status(200);
        this.res.setHeader('Content-Type', 'text/event-stream');
        this.res.setHeader('Cache-Control', 'no-cache, no-transform');
        this.res.setHeader('Connection', 'keep-alive');
        this.res.setHeader('X-Accel-Buffering', 'no');
        this.res.flushHeaders();
        void this.writeRaw('retry: 3000\n\n');
        this.heartbeat = setInterval(() => {
            if (this.closed)
                return;
            this.onHeartbeat?.();
            void this.writeRaw(': hb\n\n');
        }, 15_000);
        this.heartbeat.unref();
        this.cleanupFn = () => this.close();
        this.res.req.on('close', this.cleanupFn);
        this.res.on('close', this.cleanupFn);
        this.res.on('error', this.cleanupFn);
        this.res.on('finish', this.cleanupFn);
    }
    /**
     * Serialize a JSON-RPC message as one SSE frame. When `id` is supplied
     * (a bus event id) prepend an `id:` line so an EventSource/SSE client
     * tracks it and resends it as `Last-Event-ID` on reconnect — the resume
     * cursor for ring replay. Omitted for JSON-RPC responses and synthetic
     * terminal frames (no bus id), matching REST `formatSseFrame`.
     */
    send(message, id) {
        const payload = Buffer.from(JSON.stringify(message), 'utf8');
        return this.sendSerialized(payload, id).then(() => undefined);
    }
    sendSerialized(payload, id) {
        const idLine = id !== undefined ? `id: ${id}\n` : '';
        return this.enqueueWrite(async () => {
            if (this.closed || this.res.writableEnded)
                return 'closed';
            if (idLine && (await this.doWrite(idLine)) !== 'delivered') {
                return 'closed';
            }
            if ((await this.doWrite('data: ')) !== 'delivered')
                return 'closed';
            if ((await this.doWrite(payload)) !== 'delivered')
                return 'closed';
            const suffix = await this.doWrite('\n\n');
            if (suffix !== 'delivered')
                return suffix;
            return 'delivered';
        });
    }
    get isClosed() {
        return this.closed;
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const settle of this.activeWriteClosers)
            settle();
        if (this.heartbeat)
            clearInterval(this.heartbeat);
        if (this.cleanupFn) {
            this.res.req.off('close', this.cleanupFn);
            this.res.off('close', this.cleanupFn);
            this.res.off('error', this.cleanupFn);
            this.res.off('finish', this.cleanupFn);
            this.cleanupFn = undefined;
        }
        try {
            if (!this.res.writableEnded)
                this.res.end();
        }
        catch {
            // socket already gone — nothing to flush
        }
        // Guard `onClose`: `close()` can run inside a socket `'error'`/`'close'`
        // event handler, and a throwing callback there would escape into Node's
        // emitter stack (potential crash). Swallow + log instead.
        try {
            this.onClose?.();
        }
        catch (err) {
            writeStderrLine(`LailatulCoder serve: /acp SSE onClose threw: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    writeRaw(chunk) {
        return this.enqueueWrite(() => this.doWrite(chunk)).then(() => undefined);
    }
    enqueueWrite(write) {
        const run = () => write();
        const next = this.writeChain.then(run, run);
        // The stream OWNS write-failure handling: callers fire-and-forget
        // (`void stream.send(...)`), so a broken socket would otherwise leave a
        // zombie stream (heartbeats firing, no events delivered, no log). On the
        // first failure, log once and close so the subscription tears down.
        this.writeChain = next
            .then(() => undefined)
            .catch((err) => {
            if (!this.closed) {
                writeStderrLine(`LailatulCoder serve: /acp SSE write failed, closing stream: ${err instanceof Error ? err.message : String(err)}`);
                this.close();
            }
            return undefined;
        });
        return next.catch(() => 'failed');
    }
    doWrite(chunk) {
        return new Promise((resolve, reject) => {
            if (this.closed || this.res.writableEnded) {
                resolve('closed');
                return;
            }
            let settled = false;
            let callbackDone = false;
            let drainDone = false;
            let writeReturned;
            const cleanup = () => {
                this.activeWriteClosers.delete(onCloseEv);
                this.res.off('drain', onDrain);
                this.res.off('close', onCloseEv);
                this.res.off('finish', onCloseEv);
                this.res.off('error', onErrorEv);
            };
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(result);
            };
            const finishIfReady = () => {
                if (writeReturned !== undefined && callbackDone && drainDone) {
                    settle('delivered');
                }
            };
            const onDrain = () => {
                drainDone = true;
                finishIfReady();
            };
            const onCloseEv = () => {
                settle(writeReturned === undefined ? 'closed' : 'outcome_unknown');
            };
            const onErrorEv = (err) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                reject(err);
            };
            this.res.once('close', onCloseEv);
            this.res.once('finish', onCloseEv);
            this.res.once('error', onErrorEv);
            this.activeWriteClosers.add(onCloseEv);
            try {
                writeReturned = this.res.write(chunk, (err) => {
                    if (err) {
                        onErrorEv(err);
                        return;
                    }
                    callbackDone = true;
                    finishIfReady();
                });
            }
            catch (err) {
                onErrorEv(err);
                return;
            }
            if (settled)
                return;
            if (!writeReturned) {
                this.res.once('drain', onDrain);
            }
            else {
                drainDone = true;
            }
            finishIfReady();
            if (this.closed || this.res.writableEnded)
                onCloseEv();
        });
    }
}
//# sourceMappingURL=sse-stream.js.map