/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Identity is stamped on the `http.Server` object itself rather than tracked
 * in a side table keyed by port. A port comparison silently degrades if the
 * OS reuses the port after a restart; a tag set at construction cannot drift
 * from the socket it describes.
 *
 * `Symbol.for` rather than a module-local symbol so the tag survives duplicate
 * copies of this module in a workspace with hoisting quirks — a request whose
 * identity fails to resolve is treated as `primary`, which would let a pairing
 * token be presented to the operator listener if the lookup ever missed.
 */
const LISTENER_TAG = Symbol.for('LailatulCoder.serve.listenerIdentity');
export function tagListener(server, identity) {
    server[LISTENER_TAG] = identity;
}
const PRIMARY = { kind: 'primary' };
function fromServer(server) {
    if (!server || typeof server !== 'object')
        return undefined;
    return server[LISTENER_TAG];
}
/**
 * Resolve the listener an Express request arrived on.
 *
 * Falls back to `primary` when the socket has no server backreference — which
 * happens in unit tests that drive handlers with a synthetic `req`. Defaulting
 * to `primary` is the safe direction: it means an untagged request is held to
 * the runtime token, never to the weaker pairing credential.
 */
export function listenerIdentityOf(req) {
    const socket = req.socket;
    return fromServer(socket?.server) ?? PRIMARY;
}
/** Same resolution for the raw socket handed to an `'upgrade'` listener. */
export function listenerIdentityOfSocket(socket) {
    const withServer = socket;
    return fromServer(withServer?.server) ?? PRIMARY;
}
//# sourceMappingURL=listener-identity.js.map