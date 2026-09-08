/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ServeProtocolVersions } from './capabilities.js';
import type { AcpHttpHandle, AcpHttpSnapshot } from './acp-http/index.js';
import type { DeviceFlowRegistry } from './auth/device-flow.js';
import type { DaemonLogger, DaemonLogHealth, DaemonLogIssue, DaemonLogMode } from './daemon-logger.js';
import type { AcpSessionBridge, BridgeDaemonStatusSnapshot } from './acp-session-bridge.js';
import { type DaemonMemoryBudget } from '@lailatul-coder/acp-bridge/daemonMemoryBudget';
import type { ChildHeapMode, ChildHeapPolicySnapshot } from '@lailatul-coder/acp-bridge/childHeapPolicy';
import { type DaemonMemoryPressure } from './daemon-memory-pressure.js';
import type { RateLimiterInstance, RateLimitTier } from './rate-limit.js';
import type { ServeOptions } from './types.js';
import type { ChannelWorkerSnapshot } from './channel-worker-supervisor.js';
import type { ChannelWorkerGroupSnapshot } from './channel-worker-group.js';
import type { DaemonMetricsBucket } from './daemon-metrics-ring.js';
import type { DaemonWorkspaceService } from './workspace-service/index.js';
import type { TotalSessionAdmissionSnapshot } from './total-session-admission.js';
import type { WorkspaceRegistry } from './workspace-registry.js';
export type { DaemonMetricsBucket };
export type DaemonStatusDetail = 'summary' | 'full';
export type DaemonStatusLevel = 'ok' | 'warning' | 'error';
type SectionStatus = DaemonStatusLevel | 'unavailable';
type IssueSeverity = 'warning' | 'error';
type SectionSummary = Record<string, string | number | boolean | null>;
type StatusRecord = Record<string, unknown>;
export type DaemonStartupPreheatStatus = 'external_bridge' | 'not_scheduled' | 'scheduled' | 'running' | 'succeeded' | 'failed';
export interface DaemonStartupSnapshot {
    processStartedAt: string;
    listenerReadyAt?: string;
    processToListenMs?: number;
    runQwenServeToListenMs?: number;
    preheat: {
        status: DaemonStartupPreheatStatus;
        durationMs?: number;
        error?: string;
    };
}
export interface DaemonStatusIssue {
    code: 'session_capacity_high' | 'total_session_capacity_high' | 'connection_capacity_high' | 'pending_permissions' | 'acp_channel_down' | 'preflight_error' | 'mcp_budget_warning' | 'mcp_budget_exhausted' | 'rate_limit_hits' | 'workspace_status_unavailable' | 'channel_worker_exited' | 'channel_worker_partial_connect' | 'daemon_runtime_starting' | 'daemon_runtime_failed' | 'daemon_log_degraded' | 'daemon_memory_pressure';
    severity: IssueSeverity;
    message: string;
    section?: string;
}
export interface ParseDaemonStatusDetailResult {
    ok: boolean;
    detail?: DaemonStatusDetail;
}
export interface BuildDaemonStatusOptions {
    opts: ServeOptions;
    boundWorkspace: string;
    bridge: AcpSessionBridge;
    workspaceRegistry?: WorkspaceRegistry;
    workspace: DaemonWorkspaceService;
    daemonLog?: DaemonLogger;
    qwenCodeVersion?: string;
    acpHandle?: AcpHttpHandle;
    rateLimiter?: RateLimiterInstance;
    getRestSseActive: () => number;
    features: readonly string[];
    protocolVersions: ServeProtocolVersions;
    supportedDeviceFlowProviders: readonly string[];
    deviceFlowRegistry: DeviceFlowRegistry;
    sessionShellCommandEnabled: boolean;
    startup?: DaemonStartupSnapshot;
    getChannelWorkerSnapshot?: () => ChannelWorkerSnapshot;
    getChannelWorkerSnapshots?: () => ChannelWorkerGroupSnapshot[];
    getPerfSnapshot?: () => DaemonPerfSnapshot;
    getMetricsSeries?: () => DaemonMetricsBucket[];
    getTotalSessionAdmissionSnapshot?: () => TotalSessionAdmissionSnapshot;
    /** Returns undefined when no policy was built — direct-embed, or no budget. */
    getChildHeapPolicySnapshot?: () => ChildHeapPolicySnapshot | undefined;
}
interface DaemonStatusSection<T> {
    status: SectionStatus;
    durationMs: number;
    summary?: SectionSummary;
    data?: T;
    error?: {
        kind: 'timeout' | 'error';
        message: string;
    };
}
type WorkspaceStatusSection = DaemonStatusSection<unknown>;
interface FullDaemonStatus {
    sessions: BridgeDaemonStatusSnapshot['sessions'];
    acpMounts: AcpHttpSnapshot['mounts'];
    acpConnections: AcpHttpSnapshot['connections'];
    workspace: Record<string, WorkspaceStatusSection>;
    auth: {
        supportedDeviceFlowProviders: string[];
        pendingDeviceFlowCount: number;
    };
}
interface DaemonStatusSecurity {
    tokenConfigured: boolean;
    requireAuth: boolean;
    loopbackBind: boolean;
    allowOriginConfigured: boolean;
    allowOriginMode: string;
    sessionShellCommandEnabled: boolean;
}
interface DaemonStatusLimits {
    maxSessions: number | null;
    maxTotalSessions: number | null;
    maxPendingPromptsPerSession: number | null;
    listenerMaxConnections: number | null;
    eventRingSize: number;
    compactedReplayMaxBytes: number;
    maxJournalEvents: number;
    maxJournalBytes: number;
    promptDeadlineMs: number | null;
    writerIdleTimeoutMs: number | null;
    channelIdleTimeoutMs: number;
    sessionIdleTimeoutMs: number;
    acpConnectionCap: number | null;
    acpPreAttachMaxFramesPerStream: number | null;
    acpPreAttachMaxFramesPerConnection: number | null;
    acpPreAttachMaxFramesGlobal: number | null;
    acpPreAttachMaxPayloadBytesPerConnection: number | null;
    acpPreAttachMaxPayloadBytesGlobal: number | null;
    /**
     * The daemon's resolved memory figures. Observed and reported only: nothing
     * consumes them to size a child. `null` on paths that resolve none, such as
     * direct-embed bridges.
     */
    memory: DaemonStatusMemoryLimits | null;
}
export interface DaemonStatusMemoryLimits {
    /**
     * False, and required — scoped to the CHILD-HEAP model: every figure in
     * this section except `journalGrowth` is resolved input or a model of a
     * policy that does not exist yet; nothing sizes or bounds a child
     * process. The flag exists so a client can never mistake the modeled
     * partition for enforcement that has not shipped. Adaptive live-journal
     * growth IS a runtime effect of the budget and is reported separately
     * under `journalGrowth`.
     */
    enforced: false;
    /**
     * Adaptive live-journal growth derived from this budget — the one figure
     * in this section with runtime effect: session journal caps really do
     * grow within this pool mid-turn (per-session effective limits appear on
     * each session diagnostic in `detail=full`). `null` when growth is
     * disabled (an operator-pinned journal cap, or a budget that leaves no
     * usable pool). The pool is owned daemon-wide: every workspace bridge
     * accounts its sessions against the same single aggregate.
     */
    journalGrowth: {
        poolBytes: number;
        hardCapBytes: number;
        baselineMaxEvents: number;
        baselineMaxBytes: number;
    } | null;
    /**
     * The per-child heap partition the daemon models but does not apply.
     * `null` when no policy was built.
     */
    childHeap: {
        mode: ChildHeapMode;
        /**
         * Children the pool could host at once. 0 when no partition can be
         * modeled — either the pool cannot cover one child at the minimum heap,
         * or the ceiling would land under that minimum once capped at today's
         * host-derived one. `null` under `off`, which models nothing and so is
         * not the same claim as a pool that hosts zero children.
         */
        maxConcurrentChildren: number | null;
        /**
         * What each would receive. Never 0 and never below
         * `modeled.minChildHeapMb`; `null` instead, both under `off` and wherever
         * the partition cannot be modeled within that floor.
         */
        perChildCeilingMb: number | null;
        /**
         * Spawns that would have exceeded `maxConcurrentChildren`. Admission
         * pressure only: 0 does **not** mean the partition is safe to apply,
         * because children still run on the much larger host-derived ceiling.
         *
         * Two known sources of counts that are not capacity pressure: a channel
         * swap on a daemon already at `maxConcurrentChildren` books one, because
         * the terminating child is counted until it exits; and on a host too
         * small to model a partition this equals the total ACP spawn count, with
         * `insufficientMemory` as the field that says why.
         */
        refusals: number;
    } | null;
    /** What was asked for: the flag value, or half of available memory. */
    configuredBudgetMb: number;
    /** `configured` capped at resolved cgroup/host memory. */
    effectiveBudgetMb: number;
    budgetSource: 'flag' | 'derived';
    /** Cgroup limit when one applies, otherwise host total. */
    availableMemoryMb: number;
    availableMemorySource: 'constrained' | 'host';
    insufficientMemory: boolean;
    /**
     * Derived figures for a capacity policy that has not shipped. Grouped, and
     * named for what they are, so they cannot read as memory already reserved or
     * limits already applied.
     */
    modeled: {
        rootReserveMb: number;
        childPoolMb: number;
        minChildHeapMb: number;
        maxChildHeapMb: number;
        /**
         * A conservative model of the ceiling an ACP child receives today, with no
         * budget involved. Re-derived rather than observed, so it can sit below
         * the figure a child actually receives (see the spawn-path divergences).
         */
        legacyChildCeilingMb: number;
    };
}
export declare function toDaemonStatusMemoryLimits(budget: DaemonMemoryBudget | undefined, childHeap?: ChildHeapPolicySnapshot, journalGrowth?: DaemonStatusMemoryLimits['journalGrowth']): DaemonStatusMemoryLimits | null;
interface DaemonStatusRuntime {
    loading?: boolean;
    error?: string;
    sessions: {
        active: number;
        admissionInFlight?: number;
    };
    permissions: {
        pending: number;
        policy: string;
    };
    channel: {
        live: boolean;
    };
    channelWorker: ChannelWorkerSnapshot;
    /**
     * Per-workspace channel workers on a multi-workspace daemon. Additive to
     * `channelWorker` (which stays as the primary workspace snapshot). Absent on
     * single-workspace daemons.
     */
    channelWorkers?: ChannelWorkerGroupSnapshot[];
    transport: {
        restSseActive: number;
        acp: {
            enabled: boolean;
            connections: number;
            connectionStreams: number;
            sessionStreams: number;
            sseStreams: number;
            wsStreams: number;
            pendingClientRequests: number;
            preAttach: {
                bufferedConnectionFrames: number;
                bufferedSessionFrames: number;
                pendingDeliveryFrames: number;
                usedFrames: number;
                usedBytes: number;
                highWaterFrames: number;
                highWaterBytes: number;
                guardFailures: number;
            };
        };
    };
    rateLimit: {
        enabled: boolean;
        rejectedSinceStart: Record<RateLimitTier, number>;
    };
    /**
     * Live counts against the resolved memory budget, and what a per-child share
     * would come to at each count. The shares are advisory: nothing applies
     * them, and the gap between the registered and live figures is the reason a
     * capacity policy has to key on live children rather than registrations.
     * Absent when no budget resolved.
     */
    memory?: DaemonStatusRuntimeMemory;
    perf?: DaemonPerfSnapshot;
    /**
     * Rolling per-interval activity series backing the Daemon Status charts
     * (requests, latency, tokens, memory over time). Optional/additive to v=1:
     * absent when the daemon predates it or the sampler has not sealed a bucket
     * yet. Ordered oldest→newest.
     */
    metrics?: {
        series: DaemonMetricsBucket[];
    };
    activity: {
        activePrompts: number;
        pendingPrompts: number;
        queuedPrompts: number;
        lastActivityAt: string | null;
        idleSinceMs: number | null;
    };
    process: NodeJS.MemoryUsage;
}
interface DaemonStatusRuntimeMemory {
    /**
     * Registration count: every non-removed workspace entry, including ones
     * mid-drain, mid-replacement, or blocked. Registration is not allocation, so
     * this can exceed the live child count and is unsafe to divide the pool by.
     */
    registeredWorkspaces: number;
    /**
     * Daemon-managed ACP children with a live (non-dying) channel, including
     * transitioning or blocked entries. Excludes a workspace whose kill has
     * started (dying channel) even if the child process has not exited yet.
     * Deliberately narrow — it also excludes channel workers, MCP descendants,
     * and spawn reservations that have not attached, so a later admission policy
     * cannot mistake it for a process-tree count. Such a policy will additionally
     * need an in-flight spawn count to admit without racing.
     */
    activeAcpChildren: number;
    /**
     * Which children the daemon's RSS sampling covers: every ACP child with a
     * live channel, i.e. the same set `activeAcpChildren` counts. Still not
     * process-tree observation — channel workers and the children's own MCP
     * descendants report nothing (see `children`).
     *
     * Sampling is gated on an active SSE/WS watcher; with no client observing,
     * `children.sampled` falls to 0 even though children are live. The drop is
     * not instant: after the last watcher detaches, each reading persists until
     * it ages out of the staleness window (~30s).
     */
    childRssCoverage: 'active_children';
    /**
     * Aggregate RSS across the children `childRssCoverage` names.
     *
     * Read it as a floor and an over-count at the same time. Over, because
     * summing per-process RSS double-counts pages the children share (the node
     * binary, libc). Under, because each child reports only its own process —
     * MCP servers it spawned are invisible here, and channel workers have no
     * reporting path at all. It is not "the daemon tree's memory".
     */
    children: {
        /**
         * Sum over children that produced a reading. When `sampled` is below the
         * sibling `activeAcpChildren`, this is a floor rather than a total.
         */
        rssBytes: number;
        /**
         * How many children contributed. The denominator is `activeAcpChildren`,
         * deliberately not repeated here. 0 with live children means nothing was
         * measured — either no watcher is gating the sampler open, or the daemon
         * was built without a workspace registry to enumerate.
         */
        sampled: number;
        /**
         * Age of the oldest reading in the sum, so a caller can tell how far apart
         * its parts were taken. `null` when nothing was sampled — and also when
         * every contributor predates the field, so `null` never means "fresh".
         */
        oldestReadingAgeMs: number | null;
        /**
         * Lifetime V8 old-generation high-water marks across the sampled children,
         * as a **maximum, not a sum**. A heap ceiling applies per child, and the
         * peaks were reached at different times, so a total answers no question
         * anybody has; each field is an independent maximum, not a portrait of
         * one child. A per-child ceiling is judged against each axis on its own.
         *
         * `null` — never a zeroed object — when no sampled child reported. The
         * gating on `childRssCoverage` makes this the common case rather than an
         * edge one: with no SSE/WS watcher attached the daemon takes no sample at
         * all while children keep running. Publishing zeros there would assert
         * that no child needs any heap.
         *
         * Observational. Nothing here sizes a child or refuses a spawn; see
         * `limits.memory.enforced`, which stays `false`.
         */
        heap: {
            /** Committed high-water. Rises with the ceiling the child was given, so
             *  it bounds what the workload needs rather than stating it. */
            peakOldGenerationBytes: number;
            /** Retained-after-major-GC high-water, independent of the ceiling. The
             *  figure able to say a child cannot fit one. */
            peakLiveSetBytes: number;
            /** `total_heap_size` high-water. Includes the young generation. */
            peakTotalHeapBytes: number;
            majorGcCount: number;
            majorGcMs: number;
            /**
             * Union across the sampled children of heap spaces none of them could
             * classify. Non-empty means the byte figures are incomplete and must not
             * be read as a full measurement — a V8 taxonomy change is the way this
             * goes wrong, and it under-counts, making a child look like it fits.
             */
            unclassifiedSpaceNames: string[];
            /**
             * How many of `children.sampled` contributed a heap report. Below
             * `sampled` when some children predate the fields, so the maxima above
             * cover only part of the sampled set.
             */
            reported: number;
        } | null;
    };
    /**
     * Modeled per-child shares. Advisory; nothing applies them. Each is capped
     * at the legacy child ceiling, and floored at the minimum child heap only
     * when the ceiling allows — on a small host the ceiling sits below the
     * floor, so share x count can exceed the child pool. Read a share as
     * advisory, not a partition of the pool.
     */
    modeled: {
        /** `null` when no workspace is registered — there is no share to divide. */
        recommendedShareAtRegisteredMb: number | null;
        /** `null` when no ACP child is active — there is no share to divide. */
        recommendedShareAtActiveMb: number | null;
    };
    /**
     * The daemon root's own memory pressure. Reported in both modes; only
     * `observe` also raises a status issue from it. Covers the root process
     * alone: these figures are `process.memoryUsage()` of this process, so a
     * daemon whose children are the ones growing still reports `normal`.
     * Compare against `children.rssBytes` to see that gap.
     *
     * The computed shape is referenced rather than restated so the two cannot
     * drift: a field added or renamed in `daemon-memory-pressure.ts` would not
     * be caught by a hand copy, since spreading an object with an extra property
     * is not an excess-property error. `availableBytes` is the same figure as
     * `limits.memory.availableMemoryMb`, repeated here in bytes so the ratio can
     * be checked without cross-referencing.
     *
     * Nested here rather than at `runtime`, so it is absent whenever no budget
     * resolved — even though the heap half of the signal needs no budget. That
     * reaches direct-embed callers, and also the bootstrap `/daemon/status`
     * route — which omits `runtime.memory` wholesale even though the budget is
     * resolved before the bootstrap app exists, so `limits.memory` is populated
     * there while `pressure` is not. That window is not only startup: a daemon
     * whose runtime fails to start keeps serving the bootstrap app for its
     * lifetime, which is exactly when the reading would explain the most. Do
     * not write a client against "budget resolved implies pressure present".
     * Hoisting it out would restructure the block for a path that does not need
     * the reading.
     */
    pressure: DaemonMemoryPressure & {
        mode: 'off' | 'observe';
    };
}
export interface DaemonPipeStatsSnapshot {
    count: number;
    totalBytes: number;
    maxBytes: number;
}
export interface DaemonPerfSnapshot {
    eventLoop: {
        meanMs: number;
        p50Ms: number;
        p99Ms: number;
        maxMs: number;
    };
    promptQueueWait: {
        count: number;
        meanMs: number;
        maxMs: number;
        lastMs: number | null;
    };
    pipe: {
        inbound: DaemonPipeStatsSnapshot;
        outbound: DaemonPipeStatsSnapshot;
    };
}
export interface DaemonStatusResponse {
    v: 1;
    detail: DaemonStatusDetail;
    generatedAt: string;
    status: DaemonStatusLevel;
    issues: DaemonStatusIssue[];
    daemon: StatusRecord & {
        pid: number;
        uptimeMs: number;
        mode: ServeOptions['mode'];
        workspaceCwd: string;
        runId?: string;
        logMode?: DaemonLogMode;
        logHealth?: DaemonLogHealth;
        logIssues?: readonly DaemonLogIssue[];
        logDroppedRecords?: number;
        logDroppedBytes?: number;
    };
    security: DaemonStatusSecurity;
    limits: DaemonStatusLimits;
    workspaces?: Array<{
        id: string;
        cwd: string;
        displayName?: string;
        primary: boolean;
        trusted: boolean;
    }>;
    capabilities: {
        protocolVersions: ServeProtocolVersions;
        features: string[];
    };
    runtime: DaemonStatusRuntime;
    full?: FullDaemonStatus;
}
export declare function parseDaemonStatusDetail(raw: unknown): ParseDaemonStatusDetailResult;
export declare function buildDaemonStatusResponse(detail: DaemonStatusDetail, input: BuildDaemonStatusOptions): Promise<DaemonStatusResponse>;
export declare function allowOriginMode(allowOrigins: readonly string[] | undefined): 'none' | 'specific' | 'any';
export declare function listenerMaxConnections(value: number | undefined): number | null;
export declare function positiveFiniteOrNull(value: number | undefined): number | null;
