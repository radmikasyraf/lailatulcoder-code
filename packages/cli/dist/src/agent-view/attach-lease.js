/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
export const DEFAULT_AGENT_VIEW_ATTACH_LEASE_TTL_MS = 30_000;
export const MAX_AGENT_VIEW_ATTACH_LEASE_TTL_MS = 3_600_000;
export class AgentViewAttachLeaseManager {
    leases = new Map();
    defaultTtlMs;
    now;
    createLeaseId;
    constructor(options = {}) {
        this.defaultTtlMs =
            options.defaultTtlMs ?? DEFAULT_AGENT_VIEW_ATTACH_LEASE_TTL_MS;
        this.now = options.now ?? (() => new Date());
        this.createLeaseId = options.createLeaseId ?? randomUUID;
    }
    acquire(sessionId, options = {}) {
        this.requireSessionId(sessionId);
        this.expire();
        const existing = this.leases.get(sessionId);
        if (existing) {
            return {
                ok: false,
                reason: 'already_attached',
                lease: redactLeaseId(existing),
            };
        }
        const acquiredAt = this.now();
        const lease = {
            sessionId,
            leaseId: options.leaseId || this.createLeaseId(),
            ...(options.clientId ? { clientId: options.clientId } : {}),
            acquiredAt: acquiredAt.toISOString(),
            lastHeartbeatAt: acquiredAt.toISOString(),
            expiresAt: this.expiresAt(acquiredAt, options.ttlMs).toISOString(),
        };
        this.leases.set(sessionId, lease);
        return { ok: true, lease };
    }
    heartbeat(sessionId, leaseId, options = {}) {
        this.requireSessionId(sessionId);
        this.expire();
        const lease = this.leases.get(sessionId);
        if (!lease || lease.leaseId !== leaseId) {
            return undefined;
        }
        const now = this.now();
        const next = {
            ...lease,
            lastHeartbeatAt: now.toISOString(),
            expiresAt: this.expiresAt(now, options.ttlMs).toISOString(),
        };
        this.leases.set(sessionId, next);
        return next;
    }
    release(sessionId, leaseId) {
        this.requireSessionId(sessionId);
        this.expire();
        const lease = this.leases.get(sessionId);
        if (!lease || lease.leaseId !== leaseId) {
            return false;
        }
        this.leases.delete(sessionId);
        return true;
    }
    expire() {
        const nowMs = this.now().getTime();
        const expired = [];
        for (const [sessionId, lease] of this.leases) {
            const expiresAtMs = Date.parse(lease.expiresAt);
            if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
                this.leases.delete(sessionId);
                expired.push(lease);
            }
        }
        return expired;
    }
    get(sessionId) {
        this.requireSessionId(sessionId);
        this.expire();
        return this.leases.get(sessionId);
    }
    expiresAt(now, ttlMs) {
        const resolvedTtlMs = ttlMs ?? this.defaultTtlMs;
        if (!Number.isFinite(resolvedTtlMs) || resolvedTtlMs <= 0) {
            throw new RangeError('Attach lease ttlMs must be positive.');
        }
        if (resolvedTtlMs > MAX_AGENT_VIEW_ATTACH_LEASE_TTL_MS) {
            throw new RangeError(`Attach lease ttlMs must not exceed ${MAX_AGENT_VIEW_ATTACH_LEASE_TTL_MS}.`);
        }
        return new Date(now.getTime() + resolvedTtlMs);
    }
    requireSessionId(sessionId) {
        if (sessionId.length === 0) {
            throw new Error('Agent View session id is required.');
        }
    }
}
function redactLeaseId(lease) {
    return {
        sessionId: lease.sessionId,
        ...(lease.clientId ? { clientId: lease.clientId } : {}),
        acquiredAt: lease.acquiredAt,
        lastHeartbeatAt: lease.lastHeartbeatAt,
        expiresAt: lease.expiresAt,
    };
}
//# sourceMappingURL=attach-lease.js.map