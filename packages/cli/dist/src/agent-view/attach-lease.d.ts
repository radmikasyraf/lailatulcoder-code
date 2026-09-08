/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const DEFAULT_AGENT_VIEW_ATTACH_LEASE_TTL_MS = 30000;
export declare const MAX_AGENT_VIEW_ATTACH_LEASE_TTL_MS = 3600000;
export interface AgentViewAttachLease {
    sessionId: string;
    leaseId: string;
    clientId?: string;
    acquiredAt: string;
    lastHeartbeatAt: string;
    expiresAt: string;
}
export type AgentViewAttachLeaseConflict = Omit<AgentViewAttachLease, 'leaseId'>;
export type AgentViewAttachLeaseAcquireResult = {
    ok: true;
    lease: AgentViewAttachLease;
} | {
    ok: false;
    reason: 'already_attached';
    lease: AgentViewAttachLeaseConflict;
};
export interface AgentViewAttachLeaseAcquireOptions {
    clientId?: string;
    leaseId?: string;
    ttlMs?: number;
}
export interface AgentViewAttachLeaseHeartbeatOptions {
    ttlMs?: number;
}
export interface AgentViewAttachLeaseManagerOptions {
    defaultTtlMs?: number;
    now?: () => Date;
    createLeaseId?: () => string;
}
export declare class AgentViewAttachLeaseManager {
    private readonly leases;
    private readonly defaultTtlMs;
    private readonly now;
    private readonly createLeaseId;
    constructor(options?: AgentViewAttachLeaseManagerOptions);
    acquire(sessionId: string, options?: AgentViewAttachLeaseAcquireOptions): AgentViewAttachLeaseAcquireResult;
    heartbeat(sessionId: string, leaseId: string, options?: AgentViewAttachLeaseHeartbeatOptions): AgentViewAttachLease | undefined;
    release(sessionId: string, leaseId: string): boolean;
    expire(): AgentViewAttachLease[];
    get(sessionId: string): AgentViewAttachLease | undefined;
    private expiresAt;
    private requireSessionId;
}
