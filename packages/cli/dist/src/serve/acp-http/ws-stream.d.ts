/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { WebSocket } from 'ws';
import type { DeliveryResult, TransportCloseReason, TransportStream } from './transport-stream.js';
export declare class WsStream implements TransportStream {
    private readonly ws;
    private readonly onClose?;
    private readonly onHeartbeat?;
    readonly kind: "ws";
    private writeChain;
    private _closed;
    private heartbeat;
    private readonly activeSendClosers;
    constructor(ws: WebSocket, onClose?: (() => void) | undefined, onHeartbeat?: (() => void) | undefined);
    send(message: unknown, _id?: number): Promise<void>;
    sendSerialized(data: Buffer, _id?: number): Promise<DeliveryResult>;
    private enqueueSend;
    get isClosed(): boolean;
    close(closeReason?: TransportCloseReason): void;
}
