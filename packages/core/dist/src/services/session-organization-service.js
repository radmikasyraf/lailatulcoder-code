/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { atomicWriteJSON } from '../utils/atomicFileWrite.js';
export const GROUP_COLOR_OPTIONS = [
    'red',
    'orange',
    'yellow',
    'green',
    'blue',
    'purple',
];
export class SessionOrganizationError extends Error {
    code;
    field;
    constructor(message, code, field) {
        super(message);
        this.code = code;
        this.field = field;
        this.name = 'SessionOrganizationError';
    }
}
const STORE_FILE = 'session-organization.v1.json';
const SCHEMA_VERSION = 1;
const MAX_GROUP_NAME_LENGTH = 64;
const MAX_GROUPS = 200;
const FALLBACK_GROUP_COLOR = 'blue';
const locks = new Map();
const warningKeysByStorePath = new Map();
function hasControlCharacter(value) {
    return [...value].some((char) => {
        const codePoint = char.codePointAt(0);
        return (codePoint !== undefined &&
            ((codePoint >= 0x00 && codePoint <= 0x1f) ||
                (codePoint >= 0x7f && codePoint <= 0x9f) ||
                (codePoint >= 0x200b && codePoint <= 0x200f) ||
                (codePoint >= 0x202a && codePoint <= 0x202e) ||
                (codePoint >= 0x2066 && codePoint <= 0x2069) ||
                codePoint === 0xfeff));
    });
}
function normalizeGroupName(name) {
    if (typeof name !== 'string') {
        throw new SessionOrganizationError('`name` must be a string', 'invalid_group_name', 'name');
    }
    const trimmed = name.trim();
    if (trimmed.length === 0 ||
        trimmed.length > MAX_GROUP_NAME_LENGTH ||
        hasControlCharacter(trimmed)) {
        throw new SessionOrganizationError('`name` must be 1-64 characters and contain no control characters', 'invalid_group_name', 'name');
    }
    return trimmed;
}
function normalizeGroupColor(color) {
    const normalized = typeof color === 'string' ? color.trim() : color;
    if (typeof normalized === 'string' && isPresetGroupColor(normalized)) {
        return normalized;
    }
    if (typeof normalized === 'string' && /^#[0-9a-f]{6}$/i.test(normalized)) {
        return normalized.toLowerCase();
    }
    throw new SessionOrganizationError('`color` must be a supported preset or a #RRGGBB hex value', 'invalid_group_color', 'color');
}
function assertSessionColor(color) {
    if (typeof color !== 'string' || !isPresetGroupColor(color)) {
        throw new SessionOrganizationError('`color` must be one of the supported color options', 'invalid_group_color', 'color');
    }
}
function normalizeOrder(order) {
    if (typeof order !== 'number' ||
        !Number.isFinite(order) ||
        !Number.isSafeInteger(order)) {
        throw new SessionOrganizationError('`order` must be a safe integer', 'invalid_group_order', 'order');
    }
    return order;
}
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isPresetGroupColor(color) {
    return GROUP_COLOR_OPTIONS.includes(color);
}
function emptyStore() {
    return {
        schemaVersion: SCHEMA_VERSION,
        groups: [],
        sessions: Object.create(null),
    };
}
function groupNameKey(name) {
    return name.trim().toLowerCase();
}
function viewOrganization(organization) {
    const groupId = typeof organization?.groupId === 'string' ? organization.groupId : null;
    const color = typeof organization?.color === 'string' &&
        isPresetGroupColor(organization.color)
        ? organization.color
        : null;
    const pinnedAt = typeof organization?.pinnedAt === 'string'
        ? organization.pinnedAt
        : undefined;
    const updatedAt = typeof organization?.updatedAt === 'string'
        ? organization.updatedAt
        : new Date(0).toISOString();
    return {
        groupId,
        color,
        ...(pinnedAt !== undefined ? { pinnedAt } : {}),
        updatedAt,
        isPinned: pinnedAt !== undefined,
    };
}
function serializeOrganization(organization) {
    return {
        groupId: organization.groupId,
        ...(organization.color != null ? { color: organization.color } : {}),
        ...(organization.pinnedAt !== undefined
            ? { pinnedAt: organization.pinnedAt }
            : {}),
        updatedAt: organization.updatedAt,
    };
}
export class SessionOrganizationService {
    onWarning;
    storage;
    readFailed = false;
    constructor(cwd, onWarning) {
        this.onWarning = onWarning;
        this.storage = new Storage(cwd);
    }
    getStorePath() {
        return path.join(this.storage.getProjectDir(), STORE_FILE);
    }
    async listGroups() {
        const store = await this.readStore();
        return {
            groups: this.sortGroups(store.groups),
            colorOptions: [...GROUP_COLOR_OPTIONS],
        };
    }
    async readSnapshot() {
        const store = await this.readStore();
        const validGroupIds = new Set(store.groups.map((group) => group.id));
        const sessions = new Map();
        for (const [sessionId, raw] of Object.entries(store.sessions)) {
            const view = viewOrganization(raw);
            if (view.groupId !== null && !validGroupIds.has(view.groupId)) {
                this.warnOrphanedGroupReference(sessionId, view.groupId);
                view.groupId = null;
            }
            sessions.set(sessionId, view);
        }
        return { groups: this.sortGroups(store.groups), sessions };
    }
    async createGroup(input) {
        const name = normalizeGroupName(input.name);
        const color = normalizeGroupColor(input.color);
        return this.withStoreLock(async () => {
            const store = await this.readStore();
            this.assertGroupNameAvailable(store.groups, name);
            if (store.groups.length >= MAX_GROUPS) {
                throw new SessionOrganizationError(`Maximum number of groups (${MAX_GROUPS}) reached`, 'group_limit_reached');
            }
            const now = new Date().toISOString();
            const group = {
                id: randomUUID(),
                name,
                color,
                order: Math.min(store.groups.reduce((maxOrder, existing) => Math.max(maxOrder, existing.order), -1) + 1, Number.MAX_SAFE_INTEGER),
                createdAt: now,
                updatedAt: now,
            };
            store.groups.push(group);
            await this.writeStore(store);
            return group;
        });
    }
    async updateGroup(groupId, input) {
        return this.withStoreLock(async () => {
            const store = await this.readStore();
            const group = store.groups.find((candidate) => candidate.id === groupId);
            if (!group) {
                throw new SessionOrganizationError(`Group not found: ${groupId}`, 'group_not_found', 'groupId');
            }
            if (input.name !== undefined) {
                const name = normalizeGroupName(input.name);
                this.assertGroupNameAvailable(store.groups, name, groupId);
                group.name = name;
            }
            if (input.color !== undefined) {
                group.color = normalizeGroupColor(input.color);
            }
            if (input.order !== undefined) {
                group.order = normalizeOrder(input.order);
            }
            group.updatedAt = new Date().toISOString();
            await this.writeStore(store);
            return group;
        });
    }
    async deleteGroup(groupId) {
        return this.withStoreLock(async () => {
            const store = await this.readStore();
            const before = store.groups.length;
            store.groups = store.groups.filter((group) => group.id !== groupId);
            if (store.groups.length === before) {
                return false;
            }
            const now = new Date().toISOString();
            for (const session of Object.values(store.sessions)) {
                if (session.groupId === groupId) {
                    session.groupId = null;
                    session.updatedAt = now;
                }
            }
            await this.writeStore(store);
            return true;
        });
    }
    async updateSessionOrganization(sessionId, input) {
        const hasUpdate = input.groupId !== undefined ||
            input.isPinned !== undefined ||
            input.color !== undefined;
        return this.withStoreLock(async () => {
            const store = await this.readStore();
            const current = viewOrganization(store.sessions[sessionId]);
            if (!hasUpdate) {
                return current;
            }
            const now = new Date().toISOString();
            if (input.color !== undefined) {
                if (input.color !== null) {
                    assertSessionColor(input.color);
                }
                current.color = input.color;
            }
            if (input.groupId !== undefined) {
                if (input.groupId !== null &&
                    !store.groups.some((group) => group.id === input.groupId)) {
                    throw new SessionOrganizationError(`Group not found: ${input.groupId}`, 'group_not_found', 'groupId');
                }
                current.groupId = input.groupId;
            }
            if (input.isPinned !== undefined) {
                if (input.isPinned) {
                    current.pinnedAt = current.pinnedAt ?? now;
                }
                else {
                    delete current.pinnedAt;
                }
            }
            current.updatedAt = now;
            store.sessions[sessionId] = serializeOrganization(current);
            await this.writeStore(store);
            return viewOrganization(store.sessions[sessionId]);
        });
    }
    async removeSession(sessionId) {
        await this.withStoreLock(async () => {
            const store = await this.readStore();
            if (!Object.prototype.hasOwnProperty.call(store.sessions, sessionId)) {
                return;
            }
            delete store.sessions[sessionId];
            await this.writeStore(store);
        });
    }
    async removeSessions(sessionIds) {
        const uniqueSessionIds = [...new Set(sessionIds)];
        if (uniqueSessionIds.length === 0)
            return;
        await this.withStoreLock(async () => {
            const store = await this.readStore();
            let changed = false;
            for (const sessionId of uniqueSessionIds) {
                if (Object.prototype.hasOwnProperty.call(store.sessions, sessionId)) {
                    delete store.sessions[sessionId];
                    changed = true;
                }
            }
            if (changed) {
                await this.writeStore(store);
            }
        });
    }
    async withStoreLock(work) {
        const storePath = this.getStorePath();
        const previous = locks.get(storePath) ?? Promise.resolve();
        const next = previous.then(work, work);
        const lock = next
            .catch(() => undefined)
            .finally(() => {
            if (locks.get(storePath) === lock) {
                locks.delete(storePath);
            }
        });
        locks.set(storePath, lock);
        return next;
    }
    async readStore() {
        try {
            const raw = JSON.parse(await fs.readFile(this.getStorePath(), 'utf8'));
            if (!isPlainRecord(raw)) {
                return this.handleUnreadableStore('store root is not an object');
            }
            if (raw['schemaVersion'] !== SCHEMA_VERSION) {
                return this.handleUnreadableStore(`store schema is unsupported (found schemaVersion ${String(raw['schemaVersion'])}, expected ${SCHEMA_VERSION})`);
            }
            const groups = [];
            if (Array.isArray(raw['groups'])) {
                for (const rawGroup of raw['groups']) {
                    const group = this.normalizeSessionGroup(rawGroup);
                    if (group !== undefined) {
                        groups.push(group);
                    }
                }
            }
            const sessions = isPlainRecord(raw['sessions']) ? raw['sessions'] : {};
            const normalizedSessions = Object.create(null);
            for (const [sessionId, organization] of Object.entries(sessions)) {
                if (isPlainRecord(organization)) {
                    normalizedSessions[sessionId] = {
                        groupId: typeof organization['groupId'] === 'string'
                            ? organization['groupId']
                            : null,
                        ...(typeof organization['color'] === 'string' &&
                            isPresetGroupColor(organization['color'])
                            ? { color: organization['color'] }
                            : {}),
                        ...(typeof organization['pinnedAt'] === 'string'
                            ? { pinnedAt: organization['pinnedAt'] }
                            : {}),
                        updatedAt: typeof organization['updatedAt'] === 'string'
                            ? organization['updatedAt']
                            : new Date(0).toISOString(),
                    };
                }
                else {
                    this.warnMalformedSessionEntry(sessionId);
                }
            }
            this.readFailed = false;
            return {
                schemaVersion: SCHEMA_VERSION,
                groups: this.dedupeGroups(groups),
                sessions: normalizedSessions,
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.readFailed = false;
                return emptyStore();
            }
            return this.handleUnreadableStore(error instanceof Error ? error.message : String(error));
        }
    }
    handleUnreadableStore(reason) {
        this.readFailed = true;
        this.warnOnce(`unreadable-store:${reason}`, `Failed to read session organization store at ${this.getStorePath()}: ${reason}`);
        return emptyStore();
    }
    async writeStore(store) {
        await fs.mkdir(path.dirname(this.getStorePath()), { recursive: true });
        if (this.readFailed) {
            throw new SessionOrganizationError(`Cannot update session organization store because it could not be read: ${this.getStorePath()}. Delete the file to reset session organization (group/pin data will be lost), or restore it from backup.`, 'session_organization_store_unreadable');
        }
        await atomicWriteJSON(this.getStorePath(), {
            schemaVersion: SCHEMA_VERSION,
            groups: this.sortGroups(store.groups),
            sessions: store.sessions,
        });
        this.readFailed = false;
    }
    assertGroupNameAvailable(groups, name, exceptGroupId) {
        const key = groupNameKey(name);
        if (groups.some((group) => group.id !== exceptGroupId && groupNameKey(group.name) === key)) {
            throw new SessionOrganizationError(`Group name already exists: ${name}`, 'group_name_conflict', 'name');
        }
    }
    sortGroups(groups) {
        return [...groups].sort((a, b) => {
            const byOrder = a.order - b.order;
            if (byOrder !== 0)
                return byOrder;
            if (a.name !== b.name)
                return a.name < b.name ? -1 : 1;
            if (a.id !== b.id)
                return a.id < b.id ? -1 : 1;
            return 0;
        });
    }
    normalizeSessionGroup(value) {
        if (!isPlainRecord(value) ||
            typeof value['id'] !== 'string' ||
            typeof value['name'] !== 'string' ||
            typeof value['color'] !== 'string' ||
            typeof value['order'] !== 'number' ||
            !Number.isFinite(value['order']) ||
            typeof value['createdAt'] !== 'string' ||
            typeof value['updatedAt'] !== 'string') {
            this.warnMalformedGroupEntry(value);
            return undefined;
        }
        let color = FALLBACK_GROUP_COLOR;
        let supported = true;
        try {
            color = normalizeGroupColor(value['color']);
        }
        catch {
            supported = false;
        }
        if (!supported) {
            this.warnOnce(`unknown-group-color:${value['id']}\0${value['color']}`, `Session group "${value['name']}" (id: ${value['id']}) uses unsupported color "${value['color']}"; using "${FALLBACK_GROUP_COLOR}"`);
        }
        return {
            id: value['id'],
            name: value['name'],
            color,
            order: value['order'],
            createdAt: value['createdAt'],
            updatedAt: value['updatedAt'],
        };
    }
    dedupeGroups(groups) {
        const seen = new Set();
        const deduped = [];
        for (const group of groups) {
            const key = groupNameKey(group.name);
            if (seen.has(key)) {
                this.onWarning?.(`Dropped duplicate session group by name: "${group.name}" (id: ${group.id})`);
                continue;
            }
            seen.add(key);
            deduped.push(group);
        }
        return deduped;
    }
    warnOrphanedGroupReference(sessionId, groupId) {
        this.warnOnce(`orphaned-group:${sessionId}\0${groupId}`, `Dropped orphaned session group reference: session ${sessionId} references missing group ${groupId}`);
    }
    warnMalformedSessionEntry(sessionId) {
        this.warnOnce(`malformed-session:${sessionId}`, `Dropped malformed session organization entry: ${sessionId}`);
    }
    warnMalformedGroupEntry(value) {
        const id = isPlainRecord(value) && typeof value['id'] === 'string'
            ? value['id']
            : '<unknown>';
        this.warnOnce(`malformed-group:${id}`, `Dropped malformed session group entry: ${id}`);
    }
    warnOnce(key, message) {
        const storePath = this.getStorePath();
        let warningKeys = warningKeysByStorePath.get(storePath);
        if (warningKeys === undefined) {
            warningKeys = new Set();
            warningKeysByStorePath.set(storePath, warningKeys);
        }
        if (warningKeys.has(key))
            return;
        warningKeys.add(key);
        this.onWarning?.(message);
    }
}
//# sourceMappingURL=session-organization-service.js.map