/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Error thrown when an in-flight `callTool` is interrupted by a
 * transport disconnect mid-call. Pool does NOT auto-retry — semantics
 * are unsafe for writes (commit, file edit, etc.) and the pool can't
 * distinguish read from write. Caller decides retry policy.
 *
 * See `docs/design/f2-mcp-transport-pool.md`.
 *
 * the throw
 * site lives in the pool's `callTool` wrapper which is scheduled
 * for a later follow-up (the design's in-flight call
 * interception). Type guards (`isToolsChangedEvent`, etc.),
 * `PoolEntryConnectionStatus`, and the `Prompt` re-export were
 * removed in the same change — none had any callers and they
 * were premature public surface. `MCPCallInterruptedError` stays
 * because the design doc declares it as the user-facing contract;
 * removing it now would lose the invariant carrier across the
 * pool's lifecycle. Re-introduce the type guards alongside their
 * first concrete consumer.
 */
export class MCPCallInterruptedError extends Error {
    name = 'MCPCallInterruptedError';
    serverName;
    entryIndex;
    /** Pool entry generation at the time the call was started. */
    clientGeneration;
    /** Original args, surfaced so the caller can retry if the call is idempotent. */
    args;
    constructor(serverName, entryIndex, clientGeneration, args, message) {
        super(message ??
            `MCP call to server '${serverName}' (entry ${entryIndex}, ` +
                `generation ${clientGeneration}) was interrupted by transport ` +
                `disconnect. Pool does not auto-retry; caller must decide.`);
        this.serverName = serverName;
        this.entryIndex = entryIndex;
        this.clientGeneration = clientGeneration;
        this.args = args;
    }
}
//# sourceMappingURL=mcp-pool-events.js.map