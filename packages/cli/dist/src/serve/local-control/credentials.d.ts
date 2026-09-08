/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ListenerIdentity } from './listener-identity.js';
/**
 * What the auth middleware needs from a credential source. Kept separate from
 * {@link CredentialStore} so `auth.ts` can depend on the shape by type alone
 * and keep its single-token fallback without importing the class at runtime.
 */
export interface ListenerScopedCredentials {
    isOpen(listener: ListenerIdentity): boolean;
    verify(credentials: string, listener: ListenerIdentity): boolean;
}
/**
 * The daemon's accepted bearer credentials, scoped per listener.
 *
 * Before Local Control moved in-daemon, `bearerAuth` pre-hashed exactly one
 * token. That is why the CLI path handed the LAN the daemon token itself:
 * with a single credential there was nothing else to hand out, so a paired
 * phone held full-strength access revocable only by restart.
 *
 * The store replaces that single hash with a small set plus a scoping rule:
 *
 * | credential    | primary listener | local-control listener |
 * | ------------- | ---------------- | ---------------------- |
 * | runtime token | accepted         | **rejected**           |
 * | pairing token | **rejected**     | accepted               |
 *
 * Both rejections matter. Rejecting the runtime token on the LAN is the
 * invariant the Rust proxy enforced explicitly. Rejecting the pairing token on
 * loopback keeps a leaked pairing credential from being replayed against the
 * operator's own surface, and means revocation has exactly one place to happen.
 */
export declare class CredentialStore implements ListenerScopedCredentials {
    #private;
    constructor(runtimeToken?: string);
    addPairingToken(id: string, token: string): void;
    revokePairingToken(id: string): boolean;
    /**
     * Is the gate open — i.e. may an unauthenticated request through?
     *
     * Only ever true on the primary listener of a no-token loopback daemon,
     * preserving today's developer default. The LAN listener is never open: it
     * exists only while a pairing token does, and it must not inherit the
     * "operator chose the surface area" reasoning that governs `--hostname`.
     */
    isOpen(listener: ListenerIdentity): boolean;
    /**
     * Constant-time check of a presented credential against those valid for
     * `listener`. Every candidate in scope is compared even after a match so the
     * work is independent of which credential matched — with a handful of
     * pairing tokens the cost is negligible and the timing signal is not worth
     * reasoning about separately.
     */
    verify(credentials: string, listener: ListenerIdentity): boolean;
}
/**
 * Back-compat source for callers that still pass a bare token: one credential,
 * accepted on the primary listener, gate open when the token is absent.
 *
 * A bare token never authenticates on the LAN listener — a caller holding only
 * a single token has no pairing credential to offer, so a Local Control
 * session cannot be reached through this shape at all. That is the intended
 * failure direction: it degrades to "unreachable", not to "the runtime token
 * works over the LAN", which is exactly the behavior being retired.
 */
export declare function singleTokenCredentials(token: string | undefined): ListenerScopedCredentials;
