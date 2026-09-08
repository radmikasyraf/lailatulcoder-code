/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { writeStderrLineSafe } from '../../utils/stdioHelpers.js';
export class WsStream {
    ws;
    onClose;
    onHeartbeat;
    kind = 'ws';
    writeChain = Promise.resolve();
    _closed = false;
    heartbeat;
    activeSendClosers = new Set();
    constructor(ws, onClose, onHeartbeat) {
        this.ws = ws;
        this.onClose = onClose;
        this.onHeartbeat = onHeartbeat;
        ws.on('close', () => this.close());
        ws.on('error', (err) => {
            this.close();
            writeStderrLineSafe(`LailatulCoder serve: /acp WS error: ${err instanceof Error ? err.message : String(err)}`);
        });
        let alive = true;
        ws.on('pong', () => {
            alive = true;
        });
        this.heartbeat = setInterval(() => {
            if (this._closed)
                return;
            if (!alive) {
                this.close();
                return;
            }
            alive = false;
            try {
                this.onHeartbeat?.();
            }
            catch {
                /* swallow — heartbeat callback must not crash the interval */
            }
            try {
                this.ws.ping();
            }
            catch {
                /* socket may be gone */
            }
        }, 15_000);
        this.heartbeat.unref();
    }
    // `_id` (bus event id) is accepted for `TransportStream` parity but ignored:
    // WebSocket is a stateful connection with no SSE `Last-Event-ID` replay
    // (matches `AcpWsTransport.supportsReplay = false`).
    send(message, _id) {
        const data = JSON.stringify(message);
        return this.enqueueSend(data).then(() => undefined);
    }
    sendSerialized(data, _id) {
        return this.enqueueSend(data, { binary: false });
    }
    enqueueSend(data, options) {
        const next = this.writeChain
            .then(() => new Promise((resolve) => {
            if (this._closed) {
                resolve('closed');
                return;
            }
            let settled = false;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                this.activeSendClosers.delete(onSocketClose);
                resolve(result);
            };
            const onSocketClose = () => settle('outcome_unknown');
            const callback = (err) => {
                settle(err ? 'outcome_unknown' : 'delivered');
                if (err)
                    this.close();
            };
            if (this.ws.readyState !== this.ws.OPEN) {
                settle('closed');
                return;
            }
            this.activeSendClosers.add(onSocketClose);
            try {
                if (options)
                    this.ws.send(data, options, callback);
                else
                    this.ws.send(data, callback);
            }
            catch {
                settle('failed');
            }
        }))
            .catch(() => 'failed');
        this.writeChain = next.then((result) => {
            if (result === 'failed' && !this._closed) {
                this.close();
                writeStderrLineSafe('LailatulCoder serve: /acp WS write failed');
            }
        });
        return next;
    }
    get isClosed() {
        return this._closed;
    }
    close(closeReason) {
        if (this._closed)
            return;
        this._closed = true;
        for (const settle of this.activeSendClosers)
            settle();
        if (this.heartbeat)
            clearInterval(this.heartbeat);
        try {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.close(closeReason?.code ?? 1000, closeReason?.reason);
            }
        }
        catch {
            /* socket gone */
        }
        try {
            this.onClose?.();
        }
        catch (err) {
            writeStderrLineSafe(`LailatulCoder serve: /acp WS onClose threw: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
//# sourceMappingURL=ws-stream.js.map