/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Request, RequestHandler } from 'express';
import { type ListenerScopedCredentials } from './local-control/credentials.js';
/**
 * Reject any request that carries an `Origin` header. CLI/SDK clients never
 * set Origin; only browsers do. Returning a deterministic 403 JSON keeps
 * the daemon from CSRF-ing itself (and is more useful to clients than the
 * 500 HTML default that the `cors` package's error-callback path produces
 * when no Express error middleware is registered). `Vary: Origin` keeps
 * intermediary caches from mixing browser and CLI/SDK responses.
 */
export declare const denyBrowserOriginCors: RequestHandler;
/**
 * Parsed shape of `--allow-origin <pattern>...`. The
 * literal `*` collapses into a single boolean flag; explicit origin
 * strings live in a Set keyed by the lowercased origin (RFC 6454 §4
 * scheme/host case-insensitivity, port-sensitive).
 */
export interface ParsedAllowOriginPatterns {
    allowAny: boolean;
    origins: Set<string>;
}
/**
 * Thrown by `parseAllowOriginPatterns` when an entry
 * is neither the `*` literal nor a value that round-trips through
 * `new URL(...).origin`. Caught at boot in `runQwenServe` and converted
 * to a structured stderr message identifying the malformed entry.
 *
 * Rejection is strict by intent: trailing slashes, paths, userinfo, and
 * query strings all fail the equality check. Auto-normalizing would
 * silently accept ambiguous input — operators are better served by an
 * explicit "fix your config" than a silent accept-and-rewrite.
 */
export declare class InvalidAllowOriginPatternError extends Error {
    readonly pattern: string;
    constructor(pattern: string, reason: string);
}
/**
 * Validate the raw `--allow-origin` arg list and fold
 * it into the lookup-friendly `ParsedAllowOriginPatterns` shape. Throws
 * `InvalidAllowOriginPatternError` on the first malformed entry so the
 * operator sees the exact value to fix.
 *
 * Entries are matched origin-style (scheme + host + port). Scheme/host
 * lowercase per RFC 6454 §4; port stays exact (origins don't carry a
 * path, so there's nothing to canonicalize past `.origin`).
 */
export declare function parseAllowOriginPatterns(raw: readonly string[]): ParsedAllowOriginPatterns;
/**
 * The read side of the CORS allowlist, so the middleware can be built once at
 * app construction over a set that changes later.
 */
export interface OriginMatcher {
    allows(origin: string): boolean;
}
/**
 * A CORS allowlist that accepts runtime additions.
 *
 * `--allow-origin` entries are fixed at boot, but a Local Control session
 * advertises a LAN origin that does not exist until it is enabled and must
 * stop being honored the moment it is disabled. Registering a second CORS
 * middleware at that point would not work — Express middleware order is fixed
 * once the app is built — so the middleware is installed once over this
 * object and the set behind it moves instead.
 *
 * Dynamic entries are keyed so a caller revokes exactly what it added,
 * without needing to know whether the same origin was also configured
 * statically (in which case removing it must not revoke the operator's entry).
 */
export declare class MutableOriginAllowlist implements OriginMatcher {
    #private;
    constructor(base: ParsedAllowOriginPatterns);
    allows(origin: string): boolean;
    /** Add a runtime origin under `key`; re-adding the same key replaces it. */
    add(key: string, origin: string): void;
    remove(key: string): void;
}
/**
 * Build the CORS allowlist middleware. Replaces
 * `denyBrowserOriginCors` when `--allow-origin` is configured — owns both
 * halves of the policy (match → allow with CORS headers, unmatched →
 * 403). When no `Origin` header is present (CLI/SDK clients), passes
 * through with no work.
 *
 * Mirrors the `denyBrowserOriginCors` 403 body verbatim so existing
 * clients that parsed the wall's response don't have to special-case the
 * allowlist deployment shape.
 *
 * OPTIONS preflight short-circuits with 204 when the browser includes a
 * preflight request header. Plain OPTIONS requests keep flowing downstream
 * with CORS headers attached.
 *
 * `Access-Control-Allow-Credentials` is intentionally NOT set: the
 * daemon's auth model is bearer-token-in-`Authorization`, which works
 * cross-origin without `credentials: 'include'`. Adding credentials
 * would require a separate flag plus a "no `*` allowed" boot check
 * (CORS spec forbids `*` with credentials).
 */
export declare function allowOriginCors(patterns: ParsedAllowOriginPatterns | OriginMatcher): RequestHandler;
/**
 * Reject requests whose Host header isn't one of the bound interfaces.
 * Defense against DNS rebinding when the daemon is on loopback.
 *
 * `bind` is the hostname the listener was started with. `getPort` is read
 * lazily on each request because callers commonly request port 0 (ephemeral)
 * and only learn the actual port once `listen()` has resolved.
 */
export declare function hostAllowlist(bind: string, getPort: () => number): RequestHandler;
/**
 * Bearer token middleware. Primary loopback requests may be open when the
 * configured source has no token; Local Control always requires its pairing
 * credential. `runQwenServe` still enforces that any non-loopback primary bind
 * has a token, and that `--require-auth` boots only with a token configured.
 */
export declare function bearerAuth(source: string | undefined | ListenerScopedCredentials): RequestHandler;
export declare const AUTHENTICATED_REQUEST: unique symbol;
/**
 * Whether the request presented credentials that `bearerAuth` verified.
 * NOTE: "open" loopback requests on a no-token daemon pass `bearerAuth`
 * without being authenticated — this helper tells the two apart, which is
 * what the Local Control routes use to decide whether a response may carry
 * the pairing secret (#9106).
 */
export declare function requestWasAuthenticated(req: Request): boolean;
/**
 * Per-route mutation gate.
 *
 * A single mutation-gating helper so all state-changing routes share one
 * choke point. Routes opt into `strict: true` to enforce
 * "token required even on loopback" without depending on the operator
 * also passing `--require-auth`.
 *
 * Behavior matrix:
 *
 * | daemon config              | route opts        | result          |
 * | -------------------------- | ----------------- | --------------- |
 * | requireAuth=true           | any               | passthrough (1) |
 * | token configured           | any               | passthrough (2) |
 * | no token (loopback dev)    | strict=false      | passthrough     |
 * | no token, authenticated LAN| strict=true       | passthrough     |
 * | no token, open loopback    | strict=true       | 401 + code      |
 *
 * (1) `--require-auth` boots only with a token, so the global
 *     `bearerAuth` middleware already 401'd unauthenticated requests
 *     before they reached this gate.
 * (2) Any token configuration makes the global `bearerAuth` enforce
 *     bearer-required-everywhere; the gate is redundant but harmless.
 *
 * The 401 body uses `code: 'token_required'` (distinct from
 * `bearerAuth`'s plain `Unauthorized` shape) so SDK clients can branch
 * on it: surface a "this route needs the daemon to be configured with
 * a token; restart with --require-auth or --token" hint rather than a
 * generic auth failure. Pre-flight via `/capabilities.features.require_auth`
 * still requires a successful unauthenticated `/capabilities` call,
 * which is only possible when the daemon has not enforced auth — so
 * the gate's own 401 is the discovery surface for routes that opt in
 * to strict mode on otherwise-open daemons.
 */
export interface MutationGateOptions {
    /**
     * When true, this route refuses to serve unauthenticated callers even on
     * loopback no-token defaults, while allowing requests that passed a
     * listener-scoped pairing credential. Used by mutation routes
     * (memory, file edit, tool enable, MCP restart, device-flow auth)
     * that should never be reachable without explicit operator opt-in.
     * Defaults to false so existing routes can adopt the helper without
     * behavior change.
     *
     * Resolved caveat (#9106): the pairing credential used to be minted and
     * read back by any unauthenticated loopback caller through the Local
     * Control enable/status routes, letting a local process present the
     * credential on the LAN listener and pass this gate. The Local Control
     * routes no longer return the pairing URL or QR to unauthenticated
     * callers (`requestWasAuthenticated` gate in
     * `routes/workspace-local-control.ts`); on a no-token daemon the pairing
     * URL is printed to the daemon's own terminal instead. Obtaining the
     * credential therefore requires the daemon token (or terminal access),
     * so the strict surface no longer inherits the loopback trust boundary
     * through these routes.
     */
    strict?: boolean;
}
export interface CreateMutationGateDeps {
    /** Was the daemon configured with a bearer token? */
    tokenConfigured: boolean;
    /** Was `--require-auth` passed at boot? */
    requireAuth: boolean;
}
/**
 * Build a route-scoped mutation gate factory. Returns a function that
 * — given `MutationGateOptions` — yields an Express `RequestHandler`.
 *
 * Callers cache the factory at app construction time and invoke it per
 * route, e.g.:
 *
 *   const mutate = createMutationGate({ tokenConfigured, requireAuth });
 *   app.post('/workspace/memory', mutate({ strict: true }), handler);
 *   app.post('/session', mutate(), handler);
 *
 * The factory is hot-path-friendly: the strict-passthrough decision is
 * made once at construction and the returned handler is a cheap closure.
 */
export declare function createMutationGate(deps: CreateMutationGateDeps): (opts?: MutationGateOptions) => RequestHandler;
