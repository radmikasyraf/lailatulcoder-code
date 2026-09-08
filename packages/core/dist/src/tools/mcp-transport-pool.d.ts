/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config, MCPServerConfig } from '../config/config.js';
import { MCPServerStatus, type SendSdkMcpMessage } from './mcp-client.js';
import { type PooledConnection, type PoolEntryOptions } from './mcp-pool-entry.js';
import { type ConnectionId } from './mcp-pool-events.js';
import { type McpTransportKind } from './mcp-pool-key.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ResourceRegistry } from '../resources/resource-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { WorkspaceContext } from '../utils/workspaceContext.js';
import type { WorkspaceMcpBudget } from './mcp-workspace-budget.js';
/**
 * Pool-wide configuration. Caller (typically `QwenAgent` in daemon
 * mode) supplies these from CLI flags + env vars.
 *
 * Per-entry tuning (drain, max idle, reconnect strategy) is resolved
 * from `defaultPoolEntryOptions(transport)` at entry creation; future
 * iterations may surface override knobs here.
 */
export interface McpTransportPoolOptions {
    /** Daemon-bound workspace context shared by all entries (single registration). */
    workspaceContext: WorkspaceContext;
    /** Debug logging flag forwarded to McpClient. */
    debugMode: boolean;
    /** SDK MCP message callback; per-session at the caller level — pool bypasses SDK MCP. */
    sendSdkMcpMessage?: SendSdkMcpMessage;
    /** Set of transport families that should share pool entries. Default {stdio, websocket}. */
    pooledTransports?: ReadonlySet<McpTransportKind>;
    /** Override drain grace (default 30s). */
    drainDelayMs?: number;
    /** Override per-entry options (rare; usually defaults are sufficient). */
    entryOptions?: (transport: McpTransportKind) => PoolEntryOptions;
    /**
     * optional workspace-scoped budget controller.
     * When present, pool's `acquire` consults `tryReserve` pre-spawn
     * (refused → `BudgetExhaustedError` after `recordRefusal`) and
     * pool releases the slot when an entry transitions to `closed`
     * with no sibling entry sharing the same `serverName`. Absent →
     * pool runs unbounded (the per-session `McpClientManager`'s budget
     * machinery is dormant in pool mode anyway, so absent here means
     * "no enforcement at all" — operators get this when
     * `--mcp-client-budget` was not configured).
     */
    budget?: WorkspaceMcpBudget;
}
/**
 * Workspace-scoped shared MCP transport pool.
 *
 * core: N ACP sessions on one daemon share one transport
 * per unique (serverName + fingerprint) tuple, instead of each
 * spawning their own MCP child process.
 *
 * See `docs/design/f2-mcp-transport-pool.md` for the full design.
 * Key public methods:
 *   - `acquire(name, cfg, sessionId)` — get or spawn entry, return handle
 *   - `release(id, sessionId)` — drop one reference; pool starts drain at refs=0
 *   - `releaseSession(sessionId)` — bulk release all entries this session holds (uses reverse index, O(refs))
 *   - `restartByName(name, opts?)` — restart all entries (or one via entryIndex)
 *   - `drainAll(opts?)` — graceful + timeout-bounded shutdown for daemon close
 *
 * Lifecycle invariants:
 *   - Entries are eager: first `acquire` for a key spawns; subsequent acquires reuse
 *   - `spawnInFlight` dedupes concurrent acquires for the same key
 *   - Spawn failure releases the reserved budget slot
 *   - Drain timer cancelled on attach; restarted on last detach
 *   - `MAX_IDLE_MS` (5min default) hard cap survives drain/attach flap
 *   - Global `serverStatuses` Map written via aggregated status function
 */
export declare class McpTransportPool {
    private readonly cliConfig;
    private readonly entries;
    private readonly unpooledIds;
    private readonly spawnInFlight;
    /** Reverse index for O(refs) `releaseSession`. */
    private readonly sessionToEntries;
    /**
     * Drain mutex: when `drainAll` is in progress, new
     * acquires reject so they don't latch onto entries that are about
     * to be force-closed. Cleared by `drainAll` only on successful
     * teardown — once set, a fresh pool is required for further work.
     */
    private draining;
    /**
     * Monotonic per-server-name index for `entryIndex`. Each
     * new entry for a name gets `nextIndexByName.get(name)++`; old
     * entries keep their assigned index even after newer ones appear
     * (so dashboards don't shuffle).
     */
    private readonly nextIndexByName;
    private readonly opts;
    /**
     * @param cliConfig Daemon's bootstrap-session Config; used to call
     *   `client.discoverAndReturn(cliConfig)` during entry init. Per-
     *   session filtering / trust decoration happens later via
     *   `SessionMcpView`, not via this cliConfig.
     */
    constructor(cliConfig: Config, options: McpTransportPoolOptions);
    /**
     * expose the budget controller for snapshot
     * builders + status routes. Returns `undefined` when no budget was
     * configured at boot (operator omitted `--mcp-client-budget`).
     */
    getBudget(): WorkspaceMcpBudget | undefined;
    /**
     * Check whether any pool entry (live OR currently spawning) shares
     * the given `serverName`. Used by the close-callback and spawn-
     * failure rollback to decide whether the budget slot for `name`
     * should still be held — slot ownership is per-NAME, so the slot
     * stays reserved as long as at least one entry / spawn for the
     * name exists.
     *
     * `spawnInFlight` keys have the form `${name}::${fingerprint}`.
     * Pre-fix used `startsWith(`${name}::`)`
     * which produced a false positive when a sibling name BEGAN with
     * `${name}::` (server names can contain `::` per
     * `mcp-pool-key.test.ts:258`; `parseConnectionId` uses
     * `lastIndexOf('::')` precisely to split on the LAST occurrence).
     * `connectionIdOf` is just string concatenation — zero
     * sanitization. Now: parse each id with `parseConnectionId` and
     * compare the extracted `serverName` exactly. Malformed ids
     * (defensive) are skipped so a stray bad key in `spawnInFlight`
     * can't crash the rollback path.
     */
    private hasNameSibling;
    /**
     * Acquire a pooled (or unpooled, if `cfg` is not poolable) connection
     * for `sessionId`. Returns the connection handle; caller should call
     * `pool.release(handle.id, sessionId)` when done.
     *
     * Concurrent acquires for the same `(name, cfg)` are deduped via
     * `spawnInFlight` so only one transport is created.
     *
     * @param sessionToolRegistry The acquiring session's ToolRegistry;
     *   passed to `SessionMcpView` so filtered tool snapshots register
     *   into THIS session, not the pool's shared state.
     * @param sessionPromptRegistry Same for prompts.
     * @param sessionResourceRegistry Same for resources.
     */
    acquire(serverName: string, cfg: MCPServerConfig, sessionId: string, sessionToolRegistry: ToolRegistry, sessionPromptRegistry: PromptRegistry, sessionResourceRegistry: ResourceRegistry): Promise<PooledConnection>;
    /**
     * Drop one session's reference to a connection. Starts the drain
     * grace timer if this was the last reference.
     *
     * Idempotent on unknown id (e.g. entry already closed via restart
     * or shutdown).
     */
    release(id: ConnectionId, sessionId: string): void;
    /**
     * Bulk release all entries `sessionId` currently holds. O(refs of
     * this session) via the reverse index. Use this from
     * `acpAgent.killSession` to ensure no leaked refs.
     */
    releaseSession(sessionId: string): void;
    /**
     * Restart all pool entries matching `serverName`, or just the one
     * with `entryIndex` if specified. Runs in parallel via
     * `Promise.all` with per-entry try/catch (rejections never escape);
     * returns per-entry results so the caller can surface per-entry
     * success/failure (restart route). Note: the previous
     * docstring named `Promise.allSettled`, but the implementation
     * actually uses `Promise.all` — the per-entry try/catch makes
     * Promise.all safe but the docstring was misleading.
     */
    restartByName(serverName: string, opts?: {
        entryIndex?: number;
    }): Promise<Array<{
        entryIndex: number;
        restarted: boolean;
        durationMs?: number;
        reason?: string;
    }>>;
    /**
     * Snapshot the pool's current state for the daemon's
     * `GET /workspace/mcp` status route. Returns a plain object so the
     * caller can serialize directly.
     *
     * `entryCount` per server name + `entrySummary` array
     * (opaque `entryIndex`, NOT raw fingerprint) for multi-entry name
     * collisions.
     */
    getSnapshot(): McpPoolSnapshot;
    /**
     * Aggregate the local statuses of all entries that share `name`,
     * collapsing to a single MCPServerStatus per the "any-CONNECTED
     * wins" rule. Called by individual `PoolEntry` instances
     * via the callback wired in their constructor.
     */
    aggregateStatusByName(serverName: string): MCPServerStatus;
    /**
     * Graceful (or force) shutdown of all entries. Used by `QwenAgent.close`.
     *
     * Returns `DrainResult` with counts for shutdown logging. Wall-clock
     * bounded by `timeoutMs` (default 10s); entries that fail to close
     * within budget are reported in `errors` and the pool nevertheless
     * clears its maps (caller is exiting the process).
     */
    drainAll(opts?: {
        force?: boolean;
        timeoutMs?: number;
    }): Promise<DrainResult>;
    /**
     * shared
     * view+attach helper for the two POOLED `acquire()` branches (the
     * fast-path for an existing entry, and the post-spawn attach after
     * `await inFlight`). Pre-fix both branches inlined the same 3-step
     * pattern (build view → entry.attach → return) with identical
     * release-callback wiring; stated cleanup goal is to dedupe
     * without losing the per-call-site race-window invariant comments
     * that explain WHY each branch's surrounding ordering is what it is.
     *
     * NOT used by `createUnpooledConnection` — the unpooled release
     * callback runs `entry.forceShutdown('manual')` directly (no pool
     * refcount accounting since unpooled entries are per-session) and
     * also calls `indexDetach` from the release callback itself.
     *
     * Caller is responsible for:
     *   - Terminal-state pre-check (`!entry.isTerminated()`) + race-
     *     window self-heal (`evictEntry` on the catch path).
     *   - Reverse-index ordering (early `indexAttach` BEFORE await on
     *     the post-spawn branch; AFTER attach on the fast-path;
     *     re-indexAttach AFTER attach on post-spawn).
     *   The race-window comments live at the call sites because they
     *   describe the surrounding ordering, not the attach itself.
     */
    private attachPooledSession;
    /**
     * Roll back THIS acquire's slot reservation on
     * spawn failure. Used by both the unpooled-spawn catch and the
     * pooled-spawn-in-flight catch — both decisions are identical:
     *   - `'reserved'` → THIS acquire newly held the slot; release
     *                        if no sibling holds it
     *   - `'already_held'` → sibling holds it; never release here (the
     *                        sibling's own onClosed / evictEntry will
     *                        handle it). Pre-R24 the bare
     *                        `!hasNameSibling()` check would phantom-
     *                        release a slot this acquire never reserved
     *                        when the sibling was concurrently evicted.
     *   - `undefined` → no budget configured; nothing to do.
     */
    private rollbackReservationOnSpawnFailure;
    /**
     *
     * Single source of truth for evicting a pooled entry from
     * `this.entries` AND releasing its budget slot. Used by:
     *   - The pool-managed onClosed callback (terminal-state transition
     *     paths: `forceShutdown`, `doRestart` catch, / silent-
     *     drop listener).
     *   - The fast-path self-heal branches (catch + else-if) which
     *     pre-fix called `this.entries.delete(id)` directly and bypassed
     *     budget release entirely → permanent slot leak per occurrence.
     *
     * Identity check (`current === entry`):
     *   The same id can host multiple entry objects across its lifetime
     *   (eviction + respawn). When `forceShutdown`'s async tail
     *   (`await sweepAndDisconnect`) runs concurrently with a
     *   fast-path eviction + spawn under the same id, the OLD entry's
     *   onClosed fires AFTER the NEW entry has been inserted. Without
     *   this guard, the OLD onClosed would silently evict the NEW
     *   entry and (incorrectly) release its budget slot. `entry` may
     *   be `undefined` only during the brief constructor window where
     *   the assignment hasn't completed; in production the callback
     *   is never invoked synchronously from the constructor.
     *
     * Budget release: matches the prior inline logic exactly
     * `hasNameSibling` keeps the slot reserved when divergent-
     * fingerprint entries (e.g. multi-OAuth) or in-flight spawns share
     * the name.
     */
    private evictEntry;
    private spawnEntry;
    private allocateEntryIndex;
    private indexAttach;
    private indexDetach;
    /**
     * Per-session connection for transports that bypass the pool (SDK
     * MCP, HTTP/SSE when not opt-in). Constructs a fresh `McpClient`
     * tied to THIS session's registries. No refcounting; lifetime
     * managed by the caller via `release()`.
     *
     * Stored in `this.entries` with an `unpooled-*` id so shared lifecycle
     * methods (`releaseSession`, `drainAll`, budget sibling checks, and
     * snapshots) can still reach it even though it is never reused by another
     * session.
     */
    private createUnpooledConnection;
}
/**
 * Snapshot shape returned by `pool.getSnapshot()`. The wrapping
 * status route (commit 5) projects this into the existing
 * `GET /workspace/mcp` response with `scope: 'workspace'`.
 */
export interface McpPoolSnapshot {
    /** Total CONNECTED clients across all entries. */
    total: number;
    /**
     * Live local-subprocess count — stdio entries that are CONNECTED.
     * Websocket transports dial a (potentially remote) MCP server over
     * the network and don't spawn a local OS child, so they're
     * deliberately excluded.
     */
    subprocessCount: number;
    /** Per-server entry details. */
    byName: Record<string, {
        entryCount: number;
        entrySummary: Array<{
            entryIndex: number;
            refs: number;
            status: MCPServerStatus;
        }>;
    }>;
}
/**
 * Result of `pool.drainAll`. `forced` counts entries that didn't
 * close within the wall-clock budget — operator should investigate
 * the corresponding stderr logs.
 */
export interface DrainResult {
    drained: number;
    forced: number;
    errors: Array<{
        entryIndex: number;
        serverName: string;
        error: string;
    }>;
}
