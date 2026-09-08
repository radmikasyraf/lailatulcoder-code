/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Request } from 'express';
/**
 * Which listener a request arrived on.
 *
 * `primary` is the listener `qwen serve` binds at startup — loopback by
 * default, or whatever `--hostname` names. `local-control` is the LAN
 * listener attached at runtime by {@link LocalControlService}.
 *
 * The distinction is load-bearing for auth: the runtime token authenticates
 * only on `primary`, the pairing token only on `local-control`. That is the
 * invariant the Tauri proxy enforced by rejecting a request that already
 * carried the runtime token; in-daemon we get it by attributing the request to
 * its listener instead.
 */
export type ListenerKind = 'primary' | 'local-control';
export interface ListenerIdentity {
    readonly kind: ListenerKind;
    /**
     * The authority this listener advertises, lowercased, e.g.
     * `192.168.1.42:4170`. Set for `local-control`, where it is the sole
     * accepted `Host` value. Undefined for `primary`, which derives its
     * allowlist from the bind + port instead.
     */
    readonly authority?: string;
    /** Exact browser Origin accepted by the Local Control WebSocket gate. */
    readonly origin?: string;
}
export declare function tagListener(server: Server, identity: ListenerIdentity): void;
/**
 * Resolve the listener an Express request arrived on.
 *
 * Falls back to `primary` when the socket has no server backreference — which
 * happens in unit tests that drive handlers with a synthetic `req`. Defaulting
 * to `primary` is the safe direction: it means an untagged request is held to
 * the runtime token, never to the weaker pairing credential.
 */
export declare function listenerIdentityOf(req: Request): ListenerIdentity;
/** Same resolution for the raw socket handed to an `'upgrade'` listener. */
export declare function listenerIdentityOfSocket(socket: Duplex): ListenerIdentity;
