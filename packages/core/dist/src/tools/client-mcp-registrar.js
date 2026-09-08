/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { createDebugLogger } from '../utils/debugLogger.js';
const debugLogger = createDebugLogger('CLIENT_MCP_REGISTRAR');
/** Default ceiling on a single in-flight `mcp_message` round-trip. */
export const CLIENT_MCP_MESSAGE_TIMEOUT_MS = 30_000;
/**
 * Owns the request/response correlation for one wire (one daemon WS client).
 * A single registrar can host several named MCP servers from the same client
 * — `sendSdkMcpMessage` routes by `serverName`, and teardown is per-server or
 * wholesale (on WS close).
 */
export class ClientMcpRegistrar {
    sendFrame;
    messageTimeoutMs;
    /** Pending in-flight requests, keyed by correlation id. */
    pending = new Map();
    /** Registered server names (advertised via `mcp_register`). */
    servers = new Set();
    nextId = 1;
    closed = false;
    constructor(options) {
        this.sendFrame = options.sendFrame;
        this.messageTimeoutMs =
            options.messageTimeoutMs ?? CLIENT_MCP_MESSAGE_TIMEOUT_MS;
    }
    /**
     * Mark a server name as advertised by this client. Idempotent.
     */
    registerServer(serverName) {
        this.servers.add(serverName);
        debugLogger.debug(`Registered client MCP server '${serverName}'`);
    }
    /**
     * Drop a server name and reject any in-flight requests targeting it. Returns
     * `true` if the name was registered. Idempotent for unknown names.
     */
    unregisterServer(serverName) {
        const existed = this.servers.delete(serverName);
        this.rejectPendingFor((pending) => pending.server === serverName, new Error(`client MCP server '${serverName}' was unregistered`));
        if (existed) {
            debugLogger.debug(`Unregistered client MCP server '${serverName}'`);
        }
        return existed;
    }
    /** True if the server name has been advertised and not torn down. */
    hasServer(serverName) {
        return this.servers.has(serverName);
    }
    /** Snapshot of currently-registered server names. */
    registeredServers() {
        return [...this.servers];
    }
    /** Count of currently-registered server names (for per-connection caps). */
    serverCount() {
        return this.servers.size;
    }
    /** Count of in-flight `mcp_message` round-trips (for tests / accounting). */
    pendingCount() {
        return this.pending.size;
    }
    /**
     * The `SendSdkMcpMessage`-shaped callback to hand to `McpClientManager`
     * (via `addRuntimeMcpServer` with an `isSdkMcpServerConfig`-true config).
     *
     * Sends the JSON-RPC message as an outbound frame and resolves when the
     * client returns the correlated response frame.
     */
    sendSdkMcpMessage = (serverName, message) => {
        if (this.closed) {
            return Promise.reject(new Error(`client MCP channel is closed (server '${serverName}')`));
        }
        if (!this.servers.has(serverName)) {
            return Promise.reject(new Error(`client MCP server '${serverName}' is not registered`));
        }
        const id = `cmcp-${this.nextId++}`;
        // Notifications (no JSON-RPC `id`, e.g. `notifications/initialized`) are
        // fire-and-forget: the client-hosted server never replies. The agent's
        // transport still `await`s `send()`, so we route the frame and resolve
        // immediately with a synthetic ack — mirroring the SDK `Query` control
        // plane (`Query.ts` handleMcpMessage notification branch). Awaiting a
        // response that will never arrive would otherwise hang the handshake.
        if (!isJsonRpcRequest(message)) {
            let sendResult;
            try {
                sendResult = this.sendFrame({
                    id,
                    server: serverName,
                    payload: message,
                });
            }
            catch (err) {
                return Promise.reject(asError(err));
            }
            const ack = {
                jsonrpc: '2.0',
                id: 0,
                result: {},
            };
            if (sendResult &&
                typeof sendResult.then === 'function') {
                return sendResult.then(() => ack);
            }
            return Promise.resolve(ack);
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`client MCP server '${serverName}' did not respond within ${this.messageTimeoutMs}ms (id=${id})`));
            }, this.messageTimeoutMs);
            // Don't keep the event loop alive on the timeout alone.
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer, server: serverName });
            // Put the frame on the wire. A synchronous throw or a rejected promise
            // must fail THIS request (not leak a pending entry).
            let sendResult;
            try {
                sendResult = this.sendFrame({
                    id,
                    server: serverName,
                    payload: message,
                });
            }
            catch (err) {
                this.failPending(id, asError(err));
                return;
            }
            if (sendResult &&
                typeof sendResult.then === 'function') {
                sendResult.catch((err) => {
                    this.failPending(id, asError(err));
                });
            }
        });
    };
    /**
     * Deliver a response frame from the client. Resolves the matching pending
     * request. Unknown ids are ignored (late response after timeout, or a
     * client→daemon-initiated request the daemon doesn't track — see the
     * architecture note: server→client requests are rare and out of MVP scope).
     *
     * Returns `true` if a pending request was resolved.
     */
    resolveMessage(id, payload) {
        const pending = this.pending.get(id);
        if (!pending) {
            debugLogger.debug(`Dropping mcp_message with unknown id '${id}'`);
            return false;
        }
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.resolve(payload);
        return true;
    }
    /**
     * Tear the whole channel down (WS close). Rejects every pending request and
     * forgets all server names. Idempotent.
     */
    close(reason = 'client MCP channel closed') {
        if (this.closed)
            return;
        this.closed = true;
        this.servers.clear();
        this.rejectPendingFor(() => true, new Error(reason));
    }
    failPending(id, error) {
        const pending = this.pending.get(id);
        if (!pending)
            return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(error);
    }
    rejectPendingFor(predicate, error) {
        for (const [id, pending] of [...this.pending.entries()]) {
            if (!predicate(pending))
                continue;
            this.pending.delete(id);
            clearTimeout(pending.timer);
            pending.reject(error);
        }
    }
}
function asError(err) {
    return err instanceof Error ? err : new Error(String(err));
}
/**
 * A JSON-RPC message is a request (expects a response) when it carries both a
 * `method` and a non-null `id`. Responses/results have an `id` but no
 * `method`; notifications have a `method` but no `id`. Mirrors the request
 * test in the SDK `Query` control plane.
 */
function isJsonRpcRequest(message) {
    const m = message;
    return typeof m.method === 'string' && m.id !== undefined && m.id !== null;
}
//# sourceMappingURL=client-mcp-registrar.js.map