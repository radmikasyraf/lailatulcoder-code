/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Server } from 'node:http';
import type { Application } from 'express';
import type { MutableOriginAllowlist } from '../auth.js';
import type { CredentialStore } from './credentials.js';
export interface LocalControlStatus {
    active: boolean;
    /**
     * Paired URL, token in the fragment. Present only while active.
     *
     * The fragment is deliberate: fragments are not sent to the server, do not
     * appear in access logs, and are not carried on cross-origin navigations, so
     * the pairing secret stays client-side after the scan.
     */
    url?: string;
    /**
     * True while active when the pairing `url` was withheld from THIS response
     * because the caller did not present credentials (#9106). The URL is
     * printed to the daemon terminal instead; UIs should point the operator
     * there rather than render an empty pairing block.
     */
    urlRedacted?: boolean;
    interfaceName?: string;
    address?: string;
    port?: number;
    sleepInhibited?: boolean;
    /**
     * Whether the LAN listener is TLS-terminated. Surfaced because the UI's
     * safety line ("Trusted Wi-Fi · Unencrypted · …") has to tell the truth
     * about the specific session rather than assume the common case.
     */
    encrypted?: boolean;
}
export interface LocalControlEnableOptions {
    /** Which LAN address to expose, when the host has more than one. */
    address?: string;
    /**
     * Path + query the QR should open, e.g. `/?workspace=%2Fsrc%2Fapp`. Lets the
     * phone land on the session the operator was looking at rather than the
     * daemon root — the CLI path always advertised the root.
     */
    target?: string;
}
export declare class InvalidLocalControlTargetError extends Error {
    readonly code = "invalid_local_control_target";
    constructor();
}
export interface LocalControlServiceDeps {
    /** The same Express app the primary listener serves. */
    app: Application;
    /** Credential store the LAN listener's pairing token is registered in. */
    credentials: CredentialStore;
    /** CORS allowlist the LAN origin is added to while active. */
    originAllowlist: MutableOriginAllowlist;
    /** Attach/detach the ACP WebSocket upgrade listener to the LAN server. */
    attachWebSocket(server: Server): void;
    detachWebSocket(server: Server): void;
    /** Port to advertise. Read lazily — the primary listener may be on port 0. */
    getPort(): number;
    /**
     * `--tls-cert` / `--tls-key` paths, when the daemon was started with them.
     *
     * The LAN listener has to match the daemon's transport. Serving plaintext
     * off a daemon the operator deliberately put behind TLS would quietly
     * downgrade the surface that is by definition the *more* exposed of the two,
     * and the advertised origin would not match what the browser sees.
     *
     * Read at enable time rather than captured at boot so a certificate renewed
     * while the daemon was running is picked up by the next pairing.
     */
    tlsPaths?: {
        cert: string;
        key: string;
    };
}
/**
 * Owns the LAN listener, its credential, and its sleep assertion.
 *
 * This is the whole of what `local_control.rs` did, minus the proxying. The
 * Rust file bound a LAN socket and forwarded bytes to the loopback daemon,
 * rewriting `Host`, `Origin`, `Authorization`, and `Sec-WebSocket-Protocol` on
 * the way through — all of it compensation for one fact: `qwen serve` fixed
 * its bind address at startup and could not add a listener later.
 *
 * Here the second listener serves the same Express app directly. There are no
 * bytes to rewrite because there is no hop: the request arrives at the daemon
 * already, and the checks the proxy performed by rewriting are performed by
 * the middleware the app already has, scoped by listener identity.
 */
export declare class LocalControlService {
    #private;
    constructor(deps: LocalControlServiceDeps);
    get active(): boolean;
    status(): LocalControlStatus;
    /**
     * Bring the LAN listener up. Enabling while already active is a no-op that
     * returns the existing status rather than re-minting: a second scan of the
     * same QR must keep working, and silently invalidating the token the user is
     * mid-pairing with would be indistinguishable from a bug.
     */
    enable(options?: LocalControlEnableOptions): Promise<LocalControlStatus>;
    /**
     * Take the LAN listener down and invalidate its credential.
     *
     * Revocation happens first and unconditionally. If closing the socket fails
     * or hangs, the outcome is a listener that accepts connections no credential
     * can authenticate — inert. The reverse order would leave a live, reachable
     * listener with a valid token if teardown failed partway.
     */
    disable(): Promise<LocalControlStatus>;
    /**
     * Called from the daemon's drain path. Local Control must not outlive the
     * daemon that owns it: a listener surviving drain would hold the port and
     * keep answering with a token nothing can revoke anymore.
     */
    dispose(): Promise<void>;
}
