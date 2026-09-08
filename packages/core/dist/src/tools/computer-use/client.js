/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { homedir } from 'node:os';
import { binaryPath } from './constants.js';
export const DEFAULT_COMPUTER_USE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_COMPUTER_USE_IDLE_TIMEOUT_MS = 2_147_483_647;
export class ComputerUseClient {
    static singleton;
    binary;
    onProgress;
    maxImageDimension;
    idleTimeoutMs;
    client;
    startPromise;
    activeCalls = 0;
    idleStopTimer;
    constructor(options) {
        this.binary = options.binary;
        this.onProgress = options.onProgress ?? (() => { });
        this.maxImageDimension = options.maxImageDimension;
        this.idleTimeoutMs = normalizeIdleTimeoutMs(options.idleTimeoutMs);
    }
    /**
     * Set the screenshot longest-edge cap applied on the next (re)connect via
     * `set_config`. Cheap to call before every `start()`; the value is only
     * pushed to cua-driver inside `doStart` (once per spawn, re-applied after a
     * reconnect). `undefined` means "don't override".
     */
    setMaxImageDimension(value) {
        this.maxImageDimension = value;
    }
    setIdleTimeoutMs(value) {
        this.idleTimeoutMs = normalizeIdleTimeoutMs(value);
        this.scheduleIdleStop();
    }
    /**
     * Shared singleton instance, created with default options on first
     * access. Tests can replace it via `setSharedForTest()`.
     *
     * The binary path is derived from the pinned `CUA_DRIVER_VERSION` in
     * constants.ts, the single source of truth the downloaded binary +
     * generated `schemas.ts` agree on.
     */
    static shared() {
        if (!ComputerUseClient.singleton) {
            ComputerUseClient.singleton = new ComputerUseClient({
                binary: binaryPath(homedir()),
            });
        }
        return ComputerUseClient.singleton;
    }
    /** Test-only: replace the singleton. */
    static setSharedForTest(replacement) {
        ComputerUseClient.singleton = replacement;
    }
    isStarted() {
        return this.client !== undefined;
    }
    /**
     * Start the upstream MCP server. Idempotent: concurrent callers share
     * the same in-flight start promise.
     *
     * An optional `onProgress` callback can be supplied to receive download
     * and startup messages during this call. It overrides the instance-level
     * callback for the duration of the start operation only.
     *
     * Throws on spawn failure (binary missing / not executable, daemon
     * launch failure, etc.). The caller (bootstrap state machine) is
     * responsible for mapping the throw into user-facing UX.
     */
    async start(onProgress) {
        this.clearIdleStopTimer();
        if (this.client) {
            this.scheduleIdleStop();
            return;
        }
        if (this.startPromise)
            return this.startPromise;
        this.startPromise = this.doStart(onProgress)
            .then(() => {
            this.scheduleIdleStop();
        })
            .finally(() => {
            this.startPromise = undefined;
        });
        return this.startPromise;
    }
    async doStart(onProgress) {
        const progress = onProgress ?? this.onProgress;
        progress('Starting Computer Use driver...');
        const transport = new StdioClientTransport({
            command: this.binary,
            args: ['mcp'],
            // Inherit env so HTTPS_PROXY / cua-driver config env flow through.
            env: { ...process.env },
        });
        const client = new Client({ name: 'lailatul-coder-computer-use', version: '1.0.0' }, { capabilities: {} });
        await client.connect(transport);
        this.client = client;
        await this.applyRuntimeConfig(client, progress);
    }
    /**
     * Push session-level runtime config to a freshly connected daemon. Today
     * that is just `max_image_dimension` (the screenshot longest-edge cap),
     * applied via the `set_config` tool when an override is configured.
     *
     * Runs once per spawn — including after the reconnect in `callTool`, since a
     * daemon restart resets runtime config to its persisted default. Best-effort:
     * a failed `set_config` must NOT abort startup (the driver is still usable at
     * its default dimension), so the error is surfaced via `progress` and
     * swallowed. Calls the inner client directly to avoid recursing through
     * `callTool`'s reconnect path.
     */
    async applyRuntimeConfig(client, progress) {
        if (this.maxImageDimension === undefined)
            return;
        try {
            await client.callTool({
                name: 'set_config',
                arguments: { max_image_dimension: this.maxImageDimension },
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            progress(`Computer Use: could not apply max_image_dimension=${this.maxImageDimension} (${msg}); using driver default.`);
        }
    }
    /**
     * List the tools exposed by the upstream server. Used by the schema
     * sync script and bootstrap diagnostics.
     */
    async listTools() {
        if (!this.client)
            throw new Error('ComputerUseClient not started');
        return this.client.listTools();
    }
    /**
     * Call a tool by upstream name (NOT the lailatul-coder-facing
     * `computer_use__` prefixed name). Returns the raw MCP result so the
     * caller can inspect `isError` and parse text content.
     *
     * On transport-closed errors (e.g. macOS kills the upstream binary after
     * the user grants Screen Recording permission), this method transparently
     * tears down the stale connection, reconnects, and retries with a bounded
     * backoff loop. If the retries also fail, the last error is re-thrown.
     */
    async callTool(name, args) {
        if (!this.client)
            throw new Error('ComputerUseClient not started');
        this.activeCalls++;
        this.clearIdleStopTimer();
        try {
            try {
                return (await this.client.callTool({
                    name,
                    arguments: args,
                }));
            }
            catch (err) {
                if (!isTransportClosedError(err))
                    throw err;
                // The connection died. Two recoverable causes, both fixed by respawning
                // the proxy (which relaunches the cua-driver daemon):
                //   1. stdio "Connection closed" — the `cua-driver mcp` child was killed.
                //   2. "daemon transport error … Connection refused" — the CuaDriver
                //      DAEMON behind the proxy restarted. macOS forces a restart right
                //      after the Screen Recording grant, so the proxy's Unix socket to
                //      the daemon goes dead and every subsequent tool fails. This is the
                //      first-use failure mode (grant SR → restart → all tools error).
                //
                // Respawn + retry, with a few attempts to absorb the daemon's restart /
                // startup window (a single retry can land before the new daemon is up).
                // Element-index state is lost across the restart; the model re-snapshots
                // via get_window_state on a stale-index error.
                let lastErr = err;
                for (let attempt = 0; attempt < 3; attempt++) {
                    await this.stop();
                    await this.start();
                    if (!this.client) {
                        throw new Error('ComputerUseClient reconnect failed');
                    }
                    try {
                        return (await this.client.callTool({
                            name,
                            arguments: args,
                        }));
                    }
                    catch (retryErr) {
                        if (!isTransportClosedError(retryErr))
                            throw retryErr;
                        lastErr = retryErr;
                        // Daemon may still be coming up after a restart — back off, retry.
                        await new Promise((r) => setTimeout(r, 1000));
                    }
                }
                throw lastErr;
            }
        }
        finally {
            this.activeCalls--;
            this.scheduleIdleStop();
        }
    }
    /** Tear down the child process. Safe to call multiple times. */
    async stop() {
        this.clearIdleStopTimer();
        const client = this.client;
        this.client = undefined;
        if (client) {
            try {
                await client.close();
            }
            catch {
                // best-effort cleanup
            }
        }
    }
    scheduleIdleStop() {
        this.clearIdleStopTimer();
        if (!this.client || this.activeCalls > 0 || this.idleTimeoutMs <= 0) {
            return;
        }
        this.idleStopTimer = setTimeout(() => {
            this.idleStopTimer = undefined;
            if (this.activeCalls > 0)
                return;
            void this.stop();
        }, this.idleTimeoutMs);
        this.idleStopTimer.unref?.();
    }
    clearIdleStopTimer() {
        if (!this.idleStopTimer)
            return;
        clearTimeout(this.idleStopTimer);
        this.idleStopTimer = undefined;
    }
}
function normalizeIdleTimeoutMs(value) {
    if (value === undefined)
        return DEFAULT_COMPUTER_USE_IDLE_TIMEOUT_MS;
    if (!Number.isFinite(value))
        return DEFAULT_COMPUTER_USE_IDLE_TIMEOUT_MS;
    if (value < 0)
        return DEFAULT_COMPUTER_USE_IDLE_TIMEOUT_MS;
    if (value > MAX_COMPUTER_USE_IDLE_TIMEOUT_MS) {
        return DEFAULT_COMPUTER_USE_IDLE_TIMEOUT_MS;
    }
    return value;
}
/**
 * Returns true when `err` indicates a recoverable connection failure — either
 * the stdio transport to the `cua-driver mcp` proxy closed, OR the proxy's
 * Unix-socket link to the CuaDriver daemon died (daemon restart). Both are
 * fixed by respawning the proxy. Observed SDK / cua-driver messages:
 *
 *   "Connection closed"            – StdioClientTransport stream closed
 *   "Not connected"                – Client guard before transport is open
 *   "daemon transport error …"     – proxy → daemon Unix socket forward failed
 *   "Connection refused (os error 61)" – daemon not listening (restarted/down)
 *   "MCP error -32603 / -32000: …" – JSON-RPC wrapper around the above
 */
export function isTransportClosedError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /connection closed|not connected|connection refused|daemon transport error|os error 61/i.test(msg);
}
//# sourceMappingURL=client.js.map