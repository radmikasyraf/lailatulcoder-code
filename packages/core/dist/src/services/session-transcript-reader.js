/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Storage } from '../config/storage.js';
import * as jsonl from '../utils/jsonl-utils.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { addDaemonRequestAttribute } from '../telemetry/daemon-tracing.js';
import { readSessionTitleInfoFromFileSync } from '../utils/sessionStorageUtils.js';
import { parseGoalStateRecordPayloadV2 } from '../goals/goal-reducer.js';
import { isApiHistoryCompressionCandidate, SessionApiHistoryAccumulator, } from './session-api-history.js';
import { isResumeTokenCountsCandidate, ResumeTokenCountsAccumulator, } from './session-resume-token-counts.js';
import { getSessionTurnRecordHint, SessionTurnStateAccumulator, } from './session-turn-state.js';
import { isGoalRecoveryCandidate, normalizeGoalRecoveryRecord, selectGoalRecoveryFromRecords, } from '../goals/goal-persistence.js';
import { EvidenceSourceUnavailableError, GoalEvidenceCheckpointAccumulator, GoalEvidenceRecordIndexAccumulator, InvalidGoalEvidenceReferenceError, } from '../goals/goal-evidence.js';
import { SessionFileHistoryAccumulator } from './session-file-history-state.js';
import { selectActiveSideArtifactRecordUuids, SessionArtifactSnapshotAccumulator, } from './session-artifact-persistence.js';
import { aggregateTranscriptRecordFragments, isTranscriptConversationRecord, validateTranscriptRecord, walkTranscriptUuidChain, } from '../utils/transcript-records.js';
import { resolveBranchPoints, } from './branch-points.js';
export const SESSION_TRANSCRIPT_DEFAULT_LIMIT = 100;
export const SESSION_TRANSCRIPT_MAX_LIMIT = 500;
export const SESSION_TRANSCRIPT_CURSOR_VERSION = 1;
export const SESSION_TRANSCRIPT_MAX_INDEX_BYTES = 256 * 1024 * 1024;
export const SESSION_TRANSCRIPT_MAX_PAGE_BYTES = 4 * 1024 * 1024;
// Hard source-byte ceiling for one backward page, counting everything the
// turn-alignment and pair extensions add above the soft `maxBytes`
// selection budget. It is a backstop, not the only bound: each expansion is
// also capped at a bounded multiple of the caller's `maxBytes`. The
// workspace route caps serialized responses at twice this value, leaving
// headroom for the envelope; a single aggregated record can still exceed
// both caps (the always-take-one-record rule admits it so pagination
// cannot dead-end), in which case that anchor reports
// transcript_page_too_large.
export const SESSION_TRANSCRIPT_MAX_EXPANDED_PAGE_BYTES = 16 * 1024 * 1024;
export class InvalidSessionTranscriptCursorError extends Error {
    constructor(message = 'Invalid transcript cursor') {
        super(message);
        this.name = 'InvalidSessionTranscriptCursorError';
    }
}
export class SessionTranscriptSnapshotUnavailableError extends Error {
    constructor(sessionId) {
        super(`Transcript snapshot is unavailable for session ${sessionId}`);
        this.name = 'SessionTranscriptSnapshotUnavailableError';
    }
}
class EmptySessionTranscriptError extends SessionTranscriptSnapshotUnavailableError {
}
export class SessionTranscriptTooLargeError extends Error {
    sessionId;
    snapshotSize;
    maxBytes;
    constructor(sessionId, snapshotSize, maxBytes) {
        super(`Transcript snapshot for session ${sessionId} is too large to index (${snapshotSize} bytes, max ${maxBytes} bytes)`);
        this.sessionId = sessionId;
        this.snapshotSize = snapshotSize;
        this.maxBytes = maxBytes;
        this.name = 'SessionTranscriptTooLargeError';
    }
}
export class SessionTranscriptPageTooLargeError extends Error {
    sessionId;
    pageBytes;
    maxBytes;
    constructor(sessionId, pageBytes, maxBytes) {
        super(`Transcript page for session ${sessionId} exceeds the page budget (${pageBytes} bytes, max ${maxBytes} bytes)`);
        this.sessionId = sessionId;
        this.pageBytes = pageBytes;
        this.maxBytes = maxBytes;
        this.name = 'SessionTranscriptPageTooLargeError';
    }
}
const INDEX_CACHE_MAX_ENTRIES = 32;
const INDEX_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const INDEX_ENTRY_BASE_BYTES = 256;
const INDEX_SEGMENT_BYTES = 64;
const INDEX_STRING_BYTES = 2;
const INDEX_HINT_BASE_BYTES = 64;
const INDEX_CONTAINER_BASE_BYTES = 64;
const INDEX_CONTAINER_SLOT_BYTES = 8;
const INDEX_MAP_ENTRY_BYTES = 48;
const READ_CHUNK_SIZE = 64 * 1024;
const COOPERATIVE_READ_BYTE_BUDGET = 2 * 1024 * 1024;
const COOPERATIVE_READ_TIME_BUDGET_MS = 8;
const CURSOR_HMAC_KEY_BYTES = 32;
const CURSOR_HMAC_KEY_FILENAME = 'session-transcript-cursor-key';
const SESSION_TRANSCRIPT_SESSION_ID_PATTERN = /^[0-9a-fA-F-]{32,36}$/;
const debugLogger = createDebugLogger('SESSION_TRANSCRIPT');
function recordRestoreStage(stage, startedAt) {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        addDaemonRequestAttribute(`lailatul-coder.daemon.session_restore.${stage}_ms`, durationMs);
    }
}
function recordRestoreIndexAttributes(index) {
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.transcript_bytes', index.snapshotSize);
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.records_indexed', index.byUuid.size);
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.active_records', index.runtimeUuids.length);
}
function selectedRecordBytes(index, uuids) {
    const offsets = new Set();
    let bytes = 0;
    for (const uuid of uuids) {
        const entry = index.byUuid.get(uuid);
        if (!entry)
            continue;
        for (const segment of entry.segments) {
            if (offsets.has(segment.offset))
                continue;
            offsets.add(segment.offset);
            bytes += segment.length;
        }
    }
    return bytes;
}
function recordRestoreSelectionAttributes(index, selectedUuids, replayUuids) {
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.selected_records', selectedUuids.size);
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.selected_bytes', selectedRecordBytes(index, selectedUuids));
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.replay_records', replayUuids.size);
    addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.replay_bytes', selectedRecordBytes(index, replayUuids));
}
const indexCache = new Map();
// Per-workspace HMAC signing keys are cached for the daemon's lifetime (keyed by
// key-file path). Rotating a key file externally therefore requires a daemon
// restart to take effect — the only in-process invalidation is the corrupt
// (wrong-length) key replacement in readCursorHmacKey. This is acceptable: the
// key protects cursor integrity across workspaces, not against a local adversary
// who can already read the key file next to the transcripts it signs.
const cursorHmacKeys = new Map();
let indexCacheMaxBytesForTest;
let expandedPageBytesForTest;
let cooperativeReadByteBudgetForTest;
let cooperativeReadTimeBudgetMsForTest;
let cooperativeYieldHookForTest;
let selectedLineReadHookForTest;
let indexBuildCompleteHookForTest;
class CooperativeReadScheduler {
    processedBytes = 0;
    startedAt = performance.now();
    async afterUnit(sourceBytes) {
        this.processedBytes += sourceBytes;
        const byteBudget = cooperativeReadByteBudgetForTest ?? COOPERATIVE_READ_BYTE_BUDGET;
        const timeBudgetMs = cooperativeReadTimeBudgetMsForTest ?? COOPERATIVE_READ_TIME_BUDGET_MS;
        if (this.processedBytes < byteBudget &&
            performance.now() - this.startedAt < timeBudgetMs) {
            return;
        }
        cooperativeYieldHookForTest?.();
        await new Promise((resolve) => setImmediate(resolve));
        this.processedBytes = 0;
        this.startedAt = performance.now();
    }
}
function getExpandedPageBytes() {
    return expandedPageBytesForTest ?? SESSION_TRANSCRIPT_MAX_EXPANDED_PAGE_BYTES;
}
function projectBranchPointParts(record) {
    return (record.message?.parts ?? []).flatMap((rawPart) => {
        const projected = [];
        if (rawPart === null || typeof rawPart !== 'object')
            return projected;
        const part = rawPart;
        if (part.functionCall) {
            projected.push({
                functionCall: {
                    ...(part.functionCall.id !== undefined
                        ? { id: part.functionCall.id }
                        : {}),
                    ...(part.functionCall.name !== undefined
                        ? { name: part.functionCall.name }
                        : {}),
                },
            });
        }
        if (part.functionResponse) {
            projected.push({
                functionResponse: {
                    ...(part.functionResponse.id !== undefined
                        ? { id: part.functionResponse.id }
                        : {}),
                    ...(part.functionResponse.name !== undefined
                        ? { name: part.functionResponse.name }
                        : {}),
                },
            });
        }
        if (record.type === 'assistant' &&
            part.thought !== true &&
            typeof part.text === 'string' &&
            part.text.trim().length > 0) {
            projected.push({ text: 'visible' });
        }
        return projected;
    });
}
function projectBranchPointRecord(record) {
    const parts = projectBranchPointParts(record);
    return {
        uuid: record.uuid,
        parentUuid: record.parentUuid,
        type: record.type,
        ...(record.subtype !== undefined ? { subtype: record.subtype } : {}),
        ...(parts.length > 0 ? { message: { parts } } : {}),
        ...(record.subtype === 'branch_checkpoint'
            ? { systemPayload: record.systemPayload }
            : {}),
    };
}
function appendBranchPointRecord(records, record) {
    const projected = projectBranchPointRecord(record);
    const existing = records.get(record.uuid);
    if (!existing) {
        records.set(record.uuid, projected);
        return;
    }
    const parts = [
        ...(existing.message?.parts ?? []),
        ...(projected.message?.parts ?? []),
    ];
    // Duplicate uuids merge strictly first-wins for identity fields, matching
    // the byUuid index and fragment aggregation, so the reader never advertises
    // a branch marker that the first-wins fork path cannot honor.
    records.set(record.uuid, {
        ...existing,
        ...(parts.length > 0 ? { message: { parts } } : {}),
    });
}
function makeSessionTranscriptNotFoundError(sessionId) {
    const error = new Error(`ENOENT: no such file or directory, open '${sessionId}.jsonl'`);
    error.code = 'ENOENT';
    error.errno = -2;
    error.syscall = 'open';
    return error;
}
function isObjectRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFileMissingError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT');
}
function isAttributionSnapshotCandidate(record) {
    return (record.subtype === 'attribution_snapshot' &&
        isObjectRecord(record.systemPayload) &&
        'snapshot' in record.systemPayload);
}
function isFiniteNonNegativeInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
// Windows derives `Stats.ino` from a 64-bit file index that routinely exceeds
// 2^53, so a safe-integer check would reject every cursor there. Above 2^53 the
// value loses precision, so file identity on Windows is approximate; a bigint
// stat would be the durable fix. Byte offsets (snapshotSize/position) are still
// arithmetic operands and stay safe-integer via isFiniteNonNegativeInteger.
function isFiniteNonNegativeFileId(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function cursorPayload(state) {
    return {
        v: state.v,
        sessionId: state.sessionId,
        fileIdentity: {
            dev: state.fileIdentity.dev,
            ino: state.fileIdentity.ino,
        },
        snapshotSize: state.snapshotSize,
        position: state.position,
        ...(state.direction === 'backward' ? { direction: 'backward' } : {}),
        leafUuid: state.leafUuid,
        startTime: state.startTime,
        lastUpdated: state.lastUpdated,
        ...(state.replay !== undefined ? { replay: state.replay } : {}),
    };
}
function getCursorHmacKeyPath(workspaceCwd) {
    // This key binds cursors to one workspace and prevents remote cursor
    // tampering or cross-workspace replay. It is not intended to protect against
    // a local user who can already read the project directory and transcripts.
    return path.join(new Storage(workspaceCwd).getProjectDir(), CURSOR_HMAC_KEY_FILENAME);
}
function readCursorHmacKey(keyPath) {
    try {
        const key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64url');
        if (key.length === CURSOR_HMAC_KEY_BYTES) {
            return key;
        }
        debugLogger.warn(`invalid cursor signing key at ${keyPath}; replacing persisted key`);
        return undefined;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}
function writeCursorHmacKey(keyPath, key) {
    const encoded = `${key.toString('base64url')}\n`;
    fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
    try {
        const fd = fs.openSync(keyPath, 'wx', 0o600);
        try {
            fs.writeFileSync(fd, encoded, 'utf8');
        }
        finally {
            fs.closeSync(fd);
        }
    }
    catch (error) {
        if (error.code === 'EEXIST') {
            const existing = readCursorHmacKey(keyPath);
            if (existing) {
                return existing;
            }
            fs.writeFileSync(keyPath, encoded, { encoding: 'utf8', mode: 0o600 });
        }
        else {
            throw error;
        }
    }
    return key;
}
function getCursorHmacKey(workspaceCwd) {
    const keyPath = getCursorHmacKeyPath(workspaceCwd);
    const cached = cursorHmacKeys.get(keyPath);
    if (cached)
        return cached;
    const key = readCursorHmacKey(keyPath) ??
        writeCursorHmacKey(keyPath, crypto.randomBytes(CURSOR_HMAC_KEY_BYTES));
    cursorHmacKeys.set(keyPath, key);
    return key;
}
function signCursorPayloadWithKey(payload, key) {
    return crypto
        .createHmac('sha256', key)
        .update(JSON.stringify(payload))
        .digest('base64url');
}
function hasValidCursorMacWithKey(payload, mac, key) {
    const expected = Buffer.from(signCursorPayloadWithKey(payload, key), 'utf8');
    const actual = Buffer.from(mac, 'utf8');
    return (expected.length === actual.length &&
        crypto.timingSafeEqual(expected, actual));
}
function encodeCursorState(state, key) {
    const payload = cursorPayload(state);
    return Buffer.from(JSON.stringify({
        ...payload,
        mac: signCursorPayloadWithKey(payload, key),
    }), 'utf8').toString('base64url');
}
function decodeCursorState(cursor, key) {
    try {
        const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (!isObjectRecord(parsed)) {
            throw new InvalidSessionTranscriptCursorError();
        }
        const fileIdentity = parsed['fileIdentity'];
        if (parsed['v'] !== SESSION_TRANSCRIPT_CURSOR_VERSION ||
            typeof parsed['sessionId'] !== 'string' ||
            !isObjectRecord(fileIdentity) ||
            !isFiniteNonNegativeFileId(fileIdentity['dev']) ||
            !isFiniteNonNegativeFileId(fileIdentity['ino']) ||
            !isFiniteNonNegativeInteger(parsed['snapshotSize']) ||
            !isFiniteNonNegativeInteger(parsed['position']) ||
            (parsed['direction'] !== undefined &&
                parsed['direction'] !== 'backward') ||
            typeof parsed['leafUuid'] !== 'string' ||
            typeof parsed['startTime'] !== 'string' ||
            typeof parsed['lastUpdated'] !== 'string' ||
            typeof parsed['mac'] !== 'string') {
            debugLogger.debug('cursor decode failed: invalid payload shape');
            throw new InvalidSessionTranscriptCursorError();
        }
        const state = {
            v: SESSION_TRANSCRIPT_CURSOR_VERSION,
            sessionId: parsed['sessionId'],
            fileIdentity: {
                dev: fileIdentity['dev'],
                ino: fileIdentity['ino'],
            },
            snapshotSize: parsed['snapshotSize'],
            position: parsed['position'],
            ...(parsed['direction'] === 'backward'
                ? { direction: 'backward' }
                : {}),
            leafUuid: parsed['leafUuid'],
            startTime: parsed['startTime'],
            lastUpdated: parsed['lastUpdated'],
            ...(parsed['replay'] !== undefined ? { replay: parsed['replay'] } : {}),
        };
        if (!hasValidCursorMacWithKey(cursorPayload(state), parsed['mac'], key)) {
            debugLogger.debug(`cursor decode failed: mac mismatch session=${state.sessionId} ` +
                `position=${state.position} snapshotSize=${state.snapshotSize}`);
            throw new InvalidSessionTranscriptCursorError();
        }
        debugLogger.debug(`cursor decoded session=${state.sessionId} position=${state.position} ` +
            `snapshotSize=${state.snapshotSize}`);
        return state;
    }
    catch (error) {
        if (error instanceof InvalidSessionTranscriptCursorError) {
            throw error;
        }
        debugLogger.debug(`cursor decode failed: ${error instanceof Error ? error.message : String(error)}`);
        throw new InvalidSessionTranscriptCursorError();
    }
}
export class SessionTranscriptCursorCodec {
    key;
    constructor(key) {
        if (key.byteLength !== CURSOR_HMAC_KEY_BYTES) {
            throw new RangeError(`Transcript cursor signing key must be ${CURSOR_HMAC_KEY_BYTES} bytes`);
        }
        this.key = Buffer.from(key);
    }
    encode(state) {
        return encodeCursorState(state, this.key);
    }
    decode(cursor) {
        return decodeCursorState(cursor, this.key);
    }
}
export function encodeSessionTranscriptCursor(state, workspaceCwd) {
    return encodeCursorState(state, getCursorHmacKey(workspaceCwd));
}
export function decodeSessionTranscriptCursor(cursor, workspaceCwd) {
    return decodeCursorState(cursor, getCursorHmacKey(workspaceCwd));
}
function normalizeLimit(limit) {
    if (limit === undefined)
        return SESSION_TRANSCRIPT_DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > SESSION_TRANSCRIPT_MAX_LIMIT) {
        throw new RangeError(`Transcript limit must be an integer from 1 to ${SESSION_TRANSCRIPT_MAX_LIMIT}`);
    }
    return limit;
}
function normalizeMaxBytes(maxBytes) {
    if (maxBytes === undefined)
        return undefined;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new RangeError('Transcript page byte limit must be a positive integer');
    }
    return maxBytes;
}
function recordSegmentBytes(index, uuid) {
    const entry = index.byUuid.get(uuid);
    return (entry?.segments.reduce((total, segment) => total + segment.length, 0) ?? 0);
}
function selectPageUuids(index, position, limit, maxBytes) {
    const candidates = index.replayUuids.slice(position, position + limit);
    if (maxBytes === undefined)
        return candidates;
    const selected = [];
    let selectedBytes = 0;
    for (const uuid of candidates) {
        const bytes = recordSegmentBytes(index, uuid);
        // A single aggregate record may itself exceed the budget; it cannot be
        // split, so always take at least one record or pagination dead-ends.
        if (selected.length > 0 && selectedBytes + bytes > maxBytes)
            break;
        selected.push(uuid);
        selectedBytes += bytes;
    }
    return selected;
}
// User-role records the turn loop persists mid-turn. Replay renders them
// as inline messages, not turn boundaries (see projectUserRecord in
// transcript-replay), so turn alignment and page starts must pass over
// them. realtime_message is deliberately absent: a realtime user record is
// a genuine user turn start even though it is not a page start (see
// isReplayPageStart).
const REPLAY_MID_TURN_USER_SUBTYPES = new Set([
    'goal_runtime',
    'notification',
    'cron',
    'mid_turn_user_message',
]);
export function isReplayTurnStartType(type, subtype) {
    return (type === 'user' &&
        (subtype === undefined || !REPLAY_MID_TURN_USER_SUBTYPES.has(subtype)));
}
function isReplayTurnStart(index, uuid) {
    const entry = index.byUuid.get(uuid);
    return isReplayTurnStartType(entry?.type, entry?.subtype);
}
// A backward page can safely start at a replay turn start or at the
// assistant record owning any following tool results. The turn loop
// persists one assistant record per model response and records each tool
// run's results as one contiguous batch before the next assistant record,
// so the nearest matching assistant below a tool_result run owns it.
// Realtime conversation records are the exception: they interleave at
// wall-clock time and own no tool results, so the walk must pass through
// them instead of splitting the pair.
function isReplayPageStart(index, uuid) {
    const entry = index.byUuid.get(uuid);
    return (entry?.subtype !== 'realtime_message' &&
        (entry?.type === 'assistant' ||
            isReplayTurnStartType(entry?.type, entry?.subtype)));
}
// Walk backward from `from` toward the nearest item matching `isBoundary`,
// never below `floor`. The returned index is a boundary only if one exists
// within the bound; otherwise it is `floor` itself, so callers must re-check
// the result. Shared by the uuid-indexed reader and the record-array
// selectors (ACP bulk replay) so the walk/floor/accept policy lives in one
// place.
export function findBoundaryAtOrBefore(items, from, floor, isBoundary) {
    let candidate = from;
    while (candidate > floor && !isBoundary(items[candidate])) {
        candidate--;
    }
    return candidate;
}
function findReplayBoundaryAtOrBefore(index, from, floor, isBoundary) {
    return findBoundaryAtOrBefore(index.replayUuids, from, floor, (uuid) => isBoundary(index, uuid));
}
function backwardPageBytesFit(index, start, end, budget) {
    let total = 0;
    for (let i = start; i < end; i++) {
        total += recordSegmentBytes(index, index.replayUuids[i]);
        if (total > budget)
            return false;
    }
    return true;
}
// True when the first tool_result in [start, end) lost its owning call
// below `start`, i.e. the selection begins mid-pair. Only the first result
// needs checking: later results belong to calls at or after it, all inside
// the page once the first pair is whole.
function selectionOrphansToolResult(index, start, end) {
    for (let i = start; i < end; i++) {
        if (index.byUuid.get(index.replayUuids[i])?.type !== 'tool_result') {
            continue;
        }
        for (let owner = i - 1; owner >= start; owner--) {
            if (isReplayPageStart(index, index.replayUuids[owner]))
                return false;
        }
        return true;
    }
    return false;
}
// Selects one backward page. Worst case the page holds 3 * limit records:
// the requested window, one turn-alignment window, and one pair-extension
// window. Each expansion is additionally capped at one extra byte budget —
// a bounded multiple of the soft `maxBytes` budget, clamped to the hard
// page ceiling — so chained pages stay bounded relative to the caller's
// budget instead of jumping straight to the ceiling.
function selectBackwardPageUuids(index, sessionId, position, limit, maxBytes) {
    if (position === 0)
        return { uuids: [], nextPosition: 0 };
    // One extra byte budget per expansion: enough to admit a small
    // over-budget turn or absorb a result batch whole, but bounded relative
    // to the caller's soft budget so chained pages cannot balloon to the
    // absolute ceiling.
    const expansionByteBudget = maxBytes === undefined
        ? getExpandedPageBytes()
        : Math.min(2 * maxBytes, getExpandedPageBytes());
    let start = Math.max(0, position - limit);
    for (let i = start; i < position; i++) {
        if (isReplayTurnStart(index, index.replayUuids[i])) {
            start = i;
            break;
        }
    }
    // Turn-boundary alignment may expand the page past the requested window,
    // but never without bound: a transcript dominated by a single long turn
    // (e.g. one in-flight prompt with thousands of records) would otherwise
    // turn EVERY backward page into the whole transcript — ignoring `limit`
    // and making anchor-based pagination dead-end at the file head. Allow at
    // most one extra window (`limit` records) of expansion, and only when it
    // reaches a real boundary: otherwise keep the requested window so pages
    // inside a long turn stay `limit` records, not `2 * limit`.
    const expansionFloor = Math.max(0, position - 2 * limit);
    const expandedStart = findReplayBoundaryAtOrBefore(index, start, expansionFloor, isReplayTurnStart);
    if (isReplayTurnStart(index, index.replayUuids[expandedStart])) {
        start = expandedStart;
    }
    let selectedStart = position;
    let selectedBytes = 0;
    for (let i = position - 1; i >= start; i--) {
        const uuid = index.replayUuids[i];
        const bytes = recordSegmentBytes(index, uuid);
        // Always take at least one record so backward pagination cannot
        // dead-end.
        if (selectedStart < position &&
            maxBytes !== undefined &&
            selectedBytes + bytes > maxBytes) {
            break;
        }
        selectedStart = i;
        selectedBytes += bytes;
    }
    // Turn-alignment expansion admits a whole turn even when it overshoots
    // the soft `maxBytes` budget, but never past the expansion byte budget:
    // a page the workspace route cannot serialize would fail at its response
    // cap and dead-end backward pagination at this anchor on every retry.
    const logTurnExpansionSkipped = (reason) => {
        debugLogger.debug(`backward turn expansion skipped session=${sessionId} ` +
            `start=${index.replayUuids[selectedStart]} reason=${reason}`);
    };
    let alignedToReplayBoundary = false;
    for (let i = selectedStart; i < position; i++) {
        if (isReplayTurnStart(index, index.replayUuids[i])) {
            selectedStart = i;
            alignedToReplayBoundary = true;
            break;
        }
    }
    if (alignedToReplayBoundary && selectedStart > 0) {
        const previousTurnStart = findReplayBoundaryAtOrBefore(index, selectedStart - 1, -1, isReplayTurnStart);
        if (previousTurnStart < 0) {
            // No earlier turn start anywhere: the file head is the only boundary
            // below. Absorb the leading prefix only when it lies inside the same
            // record and byte budgets as every other expansion, so a long
            // synthetic prefix cannot balloon the page past the 3 * limit worst
            // case.
            if (expansionFloor === 0 &&
                backwardPageBytesFit(index, 0, position, expansionByteBudget)) {
                selectedStart = 0;
            }
            else {
                logTurnExpansionSkipped(expansionFloor === 0 ? 'byte-budget' : 'record-budget');
            }
        }
    }
    else if (!alignedToReplayBoundary) {
        // Expansion only pays off when it reaches a turn boundary; otherwise
        // keep the limit/maxBytes-respecting selection.
        const candidate = findReplayBoundaryAtOrBefore(index, selectedStart, expansionFloor, isReplayTurnStart);
        if (isReplayTurnStart(index, index.replayUuids[candidate])) {
            if (backwardPageBytesFit(index, candidate, position, expansionByteBudget)) {
                selectedStart = candidate;
            }
            else {
                logTurnExpansionSkipped('byte-budget');
            }
        }
    }
    // Backward replay finalizes each page independently, so a page boundary
    // between a tool call and its persisted result would render the completed
    // call as failed ("result missing") on the older page and the result as an
    // orphan block on the newer one. When the selection starts mid-pair,
    // extend the page down to the owning assistant record (or turn boundary)
    // so the pair stays on a single page. The extension runs only when a
    // tool_result in the selection actually lost its call: system records and
    // mid-turn user records are not page starts either, but walking further
    // down gains nothing when there is no pair to keep together. The walk is
    // bounded to one window below the selection: one assistant record can own
    // an arbitrarily long contiguous tool_result run (a persisted parallel
    // batch), and an uncapped walk would balloon the page far past `limit` —
    // reintroducing the unbounded growth this function exists to cap. The
    // budget covers only the records the extension adds beyond the owner —
    // the selection above already respected `maxBytes`, and the owner itself
    // is exempt the way the selection loop exempts its forced first record,
    // so a single oversized owner (which the next page would force-take
    // anyway) cannot fail the check by construction and split the pair.
    // Records between the owner and the selection — a result batch — still
    // count against the budget; an extension that would absorb more than the
    // budget keeps the bounded selection, accepting a mid-pair boundary in
    // that edge. The skip is logged so such a report stays diagnosable
    // without re-deriving the budget arithmetic.
    if (selectedStart > 0 &&
        selectionOrphansToolResult(index, selectedStart, position)) {
        const pairFloor = Math.max(0, selectedStart - limit);
        const pairStart = findReplayBoundaryAtOrBefore(index, selectedStart, pairFloor, isReplayPageStart);
        if (!isReplayPageStart(index, index.replayUuids[pairStart])) {
            debugLogger.debug(`backward pair extension skipped session=${sessionId} ` +
                `start=${index.replayUuids[selectedStart]} reason=record-budget`);
        }
        else if (!backwardPageBytesFit(index, pairStart + 1, selectedStart, expansionByteBudget)) {
            debugLogger.debug(`backward pair extension skipped session=${sessionId} ` +
                `start=${index.replayUuids[selectedStart]} reason=byte-budget`);
        }
        else {
            selectedStart = pairStart;
        }
    }
    return {
        uuids: index.replayUuids.slice(selectedStart, position),
        nextPosition: selectedStart,
    };
}
function fileIdentityFromStats(stats) {
    return { dev: stats.dev, ino: stats.ino };
}
// `ino: 0` (FAT/exFAT, some SMB mounts) is not proof that two stats describe
// the same file, but it is not treated as unverifiable here the way
// `FileReadCache` and the writer lease treat it. Those two compare identities
// that can belong to *different* files — a global `dev:ino` cache key, and an
// open handle against the path it was opened from — so a zero-inode match
// there is a false positive with real consequences.
//
// This reader only ever compares the same session's transcript path against
// itself across time, and the cursor carries a content-derived proof
// (`leafUuid` + `snapshotSize` + `lastUpdated`, all re-checked below) that
// already detects the replacement an inode comparison would catch. Refusing
// zero here bought nothing and broke pagination outright: `readPage` hands
// back a cursor built from the current identity, so on such a filesystem
// every continuation rejected the cursor the reader itself had just issued.
//
// Comparing the raw values still catches a zero/non-zero transition, which
// does mean the file changed.
function sameFileIdentity(a, b) {
    return a.dev === b.dev && a.ino === b.ino;
}
function makeCacheKey(filePath, fileIdentity, snapshotSize, lastUpdated) {
    // `lastUpdated` (file mtime) is part of the key so an in-place rewrite that
    // preserves the inode AND byte length (e.g. `rsync --inplace`, a redaction
    // pass) still invalidates the cached index instead of serving a stale one
    // whose byte offsets now point at different records.
    return `${filePath}:${fileIdentity.dev}:${fileIdentity.ino}:${snapshotSize}:${lastUpdated}`;
}
function getIndexCacheMaxBytes() {
    return indexCacheMaxBytesForTest ?? INDEX_CACHE_MAX_BYTES;
}
function estimateStringBytes(value) {
    return value ? value.length * INDEX_STRING_BYTES : 0;
}
function estimateIndexCacheBytes(index) {
    let total = INDEX_ENTRY_BASE_BYTES +
        INDEX_CONTAINER_BASE_BYTES * 6 +
        (index.physicalRecords.length +
            index.runtimeUuids.length +
            index.replayUuids.length +
            index.goalStatePositions.length +
            index.gaps.length) *
            INDEX_CONTAINER_SLOT_BYTES +
        estimateStringBytes(index.filePath) +
        estimateStringBytes(index.leafUuid) +
        estimateStringBytes(index.firstRecordUuid) +
        estimateStringBytes(index.restoreStartTime) +
        estimateStringBytes(index.startTime) +
        estimateStringBytes(index.lastUpdated);
    for (const record of index.physicalRecords) {
        total +=
            INDEX_HINT_BASE_BYTES +
                estimateStringBytes(record.uuid) +
                estimateStringBytes(record.parentUuid) +
                estimateStringBytes(record.type) +
                estimateStringBytes(record.subtype);
    }
    for (const uuid of index.runtimeUuids) {
        total += estimateStringBytes(uuid);
    }
    for (const uuid of index.replayUuids) {
        total += estimateStringBytes(uuid);
    }
    total += index.goalStatePositions.length * 8;
    for (const gap of index.gaps) {
        total +=
            INDEX_ENTRY_BASE_BYTES +
                estimateStringBytes(gap.childUuid) +
                estimateStringBytes(gap.missingParentUuid);
    }
    for (const [uuid, entry] of index.byUuid) {
        total +=
            INDEX_ENTRY_BASE_BYTES +
                INDEX_HINT_BASE_BYTES * 2 +
                (entry.goalEvidenceHint.parsedGoalContext ? INDEX_HINT_BASE_BYTES : 0) +
                INDEX_MAP_ENTRY_BYTES +
                INDEX_CONTAINER_BASE_BYTES +
                entry.segments.length * INDEX_CONTAINER_SLOT_BYTES +
                estimateStringBytes(uuid) +
                estimateStringBytes(entry.parentUuid) +
                estimateStringBytes(entry.type) +
                estimateStringBytes(entry.subtype) +
                estimateStringBytes(entry.turnHint.turnParentUuid) +
                estimateStringBytes(entry.turnHint.backgroundNotificationTaskId) +
                estimateStringBytes(entry.goalEvidenceHint.parsedGoalContext?.goalId) +
                estimateStringBytes(entry.goalEvidenceHint.parsedGoalContext?.turnId) +
                estimateStringBytes(entry.goalEvidenceHint.claimedGoalId) +
                estimateStringBytes(entry.goalEvidenceHint.provenance) +
                entry.segments.length * INDEX_SEGMENT_BYTES;
    }
    for (const [assistantUuid, checkpointUuid,] of index.branchPointsByAssistantUuid) {
        total +=
            INDEX_ENTRY_BASE_BYTES +
                estimateStringBytes(assistantUuid) +
                estimateStringBytes(checkpointUuid);
    }
    return total;
}
function getIndexCacheBytes() {
    let total = 0;
    for (const entry of indexCache.values()) {
        total += entry.byteSize ?? 0;
    }
    return total;
}
function pruneCache(now = Date.now()) {
    for (const [key, entry] of indexCache) {
        if (entry.expiresAt <= now) {
            indexCache.delete(key);
            debugLogger.debug(`index cache expired ${key}`);
        }
    }
    while (indexCache.size > INDEX_CACHE_MAX_ENTRIES) {
        const oldest = indexCache.keys().next().value;
        if (typeof oldest !== 'string')
            break;
        indexCache.delete(oldest);
        debugLogger.debug(`index cache evicted LRU ${oldest}`);
    }
    while (getIndexCacheBytes() > getIndexCacheMaxBytes()) {
        let evicted = false;
        for (const [key, entry] of indexCache) {
            if (!entry.byteSize)
                continue;
            indexCache.delete(key);
            debugLogger.debug(`index cache evicted by byte budget ${key}`);
            evicted = true;
            break;
        }
        if (!evicted)
            break;
    }
}
async function forEachLineInSnapshot(filePath, snapshotSize, onLine) {
    if (snapshotSize === 0)
        return;
    const scheduler = new CooperativeReadScheduler();
    let pending = [];
    let pendingLength = 0;
    let pendingOffset = 0;
    let streamOffset = 0;
    const stream = fs.createReadStream(filePath, {
        start: 0,
        end: snapshotSize - 1,
        highWaterMark: READ_CHUNK_SIZE,
    });
    const makePendingLine = () => pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingLength);
    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        let lineStart = 0;
        while (lineStart < buffer.length) {
            const lineEnd = buffer.indexOf(0x0a, lineStart);
            if (lineEnd === -1)
                break;
            const lineOffset = pendingLength > 0 ? pendingOffset : streamOffset + lineStart;
            const currentLine = buffer.subarray(lineStart, lineEnd);
            const rawLine = pendingLength > 0
                ? Buffer.concat([...pending, currentLine], pendingLength + currentLine.length)
                : currentLine;
            const line = rawLine.length > 0 && rawLine[rawLine.length - 1] === 0x0d
                ? rawLine.subarray(0, rawLine.length - 1)
                : rawLine;
            await onLine(line, lineOffset, line.length);
            await scheduler.afterUnit(line.length);
            pending = [];
            pendingLength = 0;
            lineStart = lineEnd + 1;
        }
        if (lineStart < buffer.length) {
            if (pendingLength === 0) {
                pendingOffset = streamOffset + lineStart;
            }
            const tail = buffer.subarray(lineStart);
            pending.push(tail);
            pendingLength += tail.length;
        }
        streamOffset += buffer.length;
    }
    if (pendingLength > 0) {
        const rawLine = makePendingLine();
        const line = rawLine[rawLine.length - 1] === 0x0d
            ? rawLine.subarray(0, rawLine.length - 1)
            : rawLine;
        await onLine(line, pendingOffset, line.length);
        await scheduler.afterUnit(line.length);
    }
}
async function readSegmentRecords(handle, filePath, segment, uuid, lineCache) {
    if (segment.length === 0)
        return [];
    let records;
    if (lineCache.value?.offset === segment.offset &&
        lineCache.value.length === segment.length) {
        records = lineCache.value.records;
    }
    else {
        selectedLineReadHookForTest?.(segment.offset, segment.length);
        const buffer = Buffer.alloc(segment.length);
        await handle.read(buffer, 0, segment.length, segment.offset);
        const line = buffer.toString('utf8').trim();
        if (line.length === 0)
            return [];
        records = jsonl
            .parseLineTolerant(line, filePath)
            .flatMap((value) => {
            const record = validateTranscriptRecord(value).record;
            return record ? [record] : [];
        });
        lineCache.value = {
            offset: segment.offset,
            length: segment.length,
            records,
        };
    }
    const anomalySessionId = path.basename(filePath, '.jsonl');
    const record = records[segment.fragmentIndex];
    if (!record) {
        debugLogger.warn(`segment read anomaly: no fragment session=${anomalySessionId} ` +
            `uuid=${uuid} offset=${segment.offset} fragment=${segment.fragmentIndex}`);
        // The frozen snapshot changed under us (e.g. an in-place rewrite that kept
        // the inode and byte length): the recorded offset no longer parses to the
        // expected record. Surface it as snapshot-unavailable (→ 409) rather than
        // silently dropping the record and returning a short/empty transcript.
        throw new SessionTranscriptSnapshotUnavailableError(anomalySessionId);
    }
    if (record.uuid !== uuid) {
        debugLogger.warn(`segment read anomaly: uuid mismatch session=${anomalySessionId} ` +
            `expected=${uuid} actual=${record.uuid} offset=${segment.offset}`);
        throw new SessionTranscriptSnapshotUnavailableError(anomalySessionId);
    }
    if (record.sessionId !== anomalySessionId) {
        debugLogger.warn(`segment read anomaly: session mismatch session=${anomalySessionId} ` +
            `recordSession=${record.sessionId} uuid=${uuid} offset=${segment.offset}`);
        throw new SessionTranscriptSnapshotUnavailableError(anomalySessionId);
    }
    return [record];
}
async function forEachAggregatedRecord(index, uuids, onRecord, context) {
    if (!context) {
        await withAggregatedRecordReadContext(index, (readContext) => forEachAggregatedRecord(index, uuids, onRecord, readContext));
        return;
    }
    for (const uuid of uuids) {
        const entry = index.byUuid.get(uuid);
        if (!entry)
            continue;
        const preloadedRecord = context.preloadedRecords?.get(uuid);
        if (preloadedRecord) {
            context.preloadedRecords?.delete(uuid);
            await onRecord(preloadedRecord);
            continue;
        }
        const physicalRecords = [];
        for (const segment of entry.segments) {
            physicalRecords.push(...(await readSegmentRecords(context.handle, index.filePath, segment, uuid, context.lineCache)));
        }
        if (physicalRecords.length > 0) {
            await onRecord(aggregateTranscriptRecordFragments(physicalRecords));
        }
        await context.scheduler.afterUnit(entry.segments.reduce((total, segment) => total + segment.length, 0));
    }
}
async function withAggregatedRecordReadContext(index, callback) {
    let handle;
    try {
        handle = await fsp.open(index.filePath, 'r');
    }
    catch (error) {
        if (isFileMissingError(error)) {
            throw new SessionTranscriptSnapshotUnavailableError(path.basename(index.filePath, '.jsonl'));
        }
        throw error;
    }
    const context = {
        handle,
        scheduler: new CooperativeReadScheduler(),
        lineCache: {},
    };
    try {
        return await callback(context);
    }
    finally {
        await context.handle.close();
    }
}
async function readAggregatedRecords(index, uuids) {
    const records = [];
    await forEachAggregatedRecord(index, uuids, (record) => {
        records.push(record);
    });
    return records;
}
async function readGoalStatePayloadBeforePosition(index, position) {
    let low = 0;
    let high = index.goalStatePositions.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (index.goalStatePositions[middle] < position) {
            low = middle + 1;
        }
        else {
            high = middle;
        }
    }
    const goalStatePosition = index.goalStatePositions[low - 1];
    if (goalStatePosition === undefined)
        return undefined;
    const uuid = index.replayUuids[goalStatePosition];
    const [record] = await readAggregatedRecords(index, [uuid]);
    return parseGoalStateRecordPayloadV2(record?.systemPayload);
}
async function buildIndex(params) {
    const { filePath, fileIdentity, snapshotSize, lastUpdated } = params;
    const sessionId = path.basename(filePath, '.jsonl');
    if (snapshotSize > SESSION_TRANSCRIPT_MAX_INDEX_BYTES) {
        debugLogger.warn(`index rejected: snapshot too large session=${sessionId} ` +
            `snapshotSize=${snapshotSize} max=${SESSION_TRANSCRIPT_MAX_INDEX_BYTES}`);
        throw new SessionTranscriptTooLargeError(sessionId, snapshotSize, SESSION_TRANSCRIPT_MAX_INDEX_BYTES);
    }
    debugLogger.debug(`index build start session=${sessionId} snapshotSize=${snapshotSize}`);
    const byUuid = new Map();
    // Retain only the fields required by the shared branch resolver while the
    // frozen snapshot is parsed, so page reads never reopen the full active chain.
    const branchPointRecords = new Map();
    const goalEvidenceAccumulators = new Map();
    let sequence = 0;
    const physicalRecords = [];
    let leafUuid;
    let firstRecordUuid;
    let firstRecordTimestamp;
    let startTime;
    try {
        await forEachLineInSnapshot(filePath, snapshotSize, (line, offset, length) => {
            const text = line.toString('utf8').trim();
            if (text.length === 0)
                return;
            let fragmentIndex = 0;
            for (const value of jsonl.parseLineTolerant(text, filePath)) {
                const record = validateTranscriptRecord(value).record;
                if (!record) {
                    continue;
                }
                if (firstRecordUuid === undefined) {
                    firstRecordUuid = record.uuid;
                    firstRecordTimestamp = record.timestamp;
                }
                const sideTaskSource = record.type === 'system' &&
                    record.subtype === 'session_source' &&
                    isObjectRecord(record.systemPayload) &&
                    record.systemPayload['sourceType'] === 'side_task';
                if (isTranscriptConversationRecord(record)) {
                    appendBranchPointRecord(branchPointRecords, record);
                    if (record.timestamp)
                        startTime ??= record.timestamp;
                    leafUuid = record.uuid;
                }
                const existing = byUuid.get(record.uuid);
                physicalRecords.push({
                    uuid: record.uuid,
                    parentUuid: record.parentUuid,
                    type: record.type,
                    ...(record.subtype !== undefined
                        ? { subtype: record.subtype }
                        : {}),
                });
                const segment = {
                    offset,
                    length,
                    sequence: sequence++,
                    fragmentIndex,
                };
                fragmentIndex++;
                if (existing) {
                    existing.segments.push(segment);
                    existing.sessionIdMatchesFile &&= record.sessionId === sessionId;
                    if (existing.type === 'assistant' && record.usageMetadata) {
                        existing.resumeTokenCountsCandidate =
                            isResumeTokenCountsCandidate({
                                ...record,
                                type: existing.type,
                                subtype: existing.subtype,
                            });
                    }
                    existing.turnHint.countsAsUserPrompt ||= getSessionTurnRecordHint(record, sessionId).countsAsUserPrompt;
                    goalEvidenceAccumulators
                        .get(record.uuid)
                        ?.addFragment(record);
                }
                else {
                    const chatRecord = record;
                    const goalEvidenceAccumulator = new GoalEvidenceRecordIndexAccumulator(chatRecord);
                    const goalEvidenceHint = goalEvidenceAccumulator.finish();
                    if (goalEvidenceHint.provenance) {
                        goalEvidenceAccumulators.set(record.uuid, goalEvidenceAccumulator);
                    }
                    byUuid.set(record.uuid, {
                        parentUuid: record.parentUuid,
                        sessionIdMatchesFile: record.sessionId === sessionId,
                        type: record.type,
                        ...(record.subtype !== undefined
                            ? { subtype: record.subtype }
                            : {}),
                        inherited: record.forkedFrom !== undefined,
                        sideTaskSource,
                        apiHistoryCompressionCandidate: isApiHistoryCompressionCandidate(chatRecord),
                        resumeTokenCountsCandidate: isResumeTokenCountsCandidate(chatRecord),
                        attributionSnapshotCandidate: isAttributionSnapshotCandidate(chatRecord),
                        goalRecoveryCandidate: isGoalRecoveryCandidate(chatRecord),
                        goalEvidenceHint,
                        turnHint: getSessionTurnRecordHint(chatRecord, sessionId),
                        segments: [segment],
                    });
                }
            }
        });
    }
    catch (error) {
        if (isFileMissingError(error)) {
            throw new SessionTranscriptSnapshotUnavailableError(sessionId);
        }
        throw error;
    }
    for (const [uuid, accumulator] of goalEvidenceAccumulators) {
        byUuid.get(uuid).goalEvidenceHint = accumulator.finish();
    }
    for (const [uuid, entry] of byUuid) {
        if (!entry.sessionIdMatchesFile) {
            debugLogger.warn(`transcript session mismatch session=${sessionId} uuid=${uuid}`);
            throw new SessionTranscriptSnapshotUnavailableError(sessionId);
        }
    }
    if (!leafUuid || !firstRecordUuid) {
        debugLogger.warn(`index build failed: no active transcript records session=${sessionId}`);
        throw new EmptySessionTranscriptError(sessionId);
    }
    startTime ??= lastUpdated;
    const restoreStartTime = firstRecordTimestamp ?? startTime;
    const chain = walkTranscriptUuidChain(leafUuid, (uuid) => {
        const entry = byUuid.get(uuid);
        return entry && isTranscriptConversationRecord(entry)
            ? {
                uuid,
                parentUuid: entry.parentUuid,
                sessionId,
                timestamp: startTime,
                type: 'system',
            }
            : undefined;
    });
    const runtimeUuids = [...chain.uuids];
    const sourceBoundary = runtimeUuids.findIndex((uuid) => byUuid.get(uuid)?.sideTaskSource === true);
    const replayUuids = sourceBoundary >= 0
        ? runtimeUuids
            .slice(sourceBoundary)
            .filter((uuid) => byUuid.get(uuid)?.inherited !== true)
        : [...runtimeUuids];
    const goalStatePositions = [];
    for (let position = 0; position < replayUuids.length; position++) {
        const uuid = replayUuids[position];
        const entry = byUuid.get(uuid);
        if (entry?.type === 'system' && entry.subtype === 'goal_state') {
            goalStatePositions.push(position);
        }
    }
    const gaps = [...chain.gaps];
    if (chain.cycleUuid) {
        debugLogger.debug(`active chain terminated: cycle session=${sessionId} uuid=${chain.cycleUuid}`);
    }
    const branchPointsByAssistantUuid = new Map([
        ...resolveBranchPoints(replayUuids.flatMap((uuid) => {
            const record = branchPointRecords.get(uuid);
            return record ? [record] : [];
        })).values(),
    ].map((point) => [point.assistantRecordUuid, point.checkpointUuid]));
    debugLogger.debug(`index build complete session=${sessionId} records=${byUuid.size} ` +
        `runtime=${runtimeUuids.length} replay=${replayUuids.length} ` +
        `gaps=${gaps.length} branchPoints=${branchPointsByAssistantUuid.size}`);
    await indexBuildCompleteHookForTest?.(filePath);
    return {
        filePath,
        fileIdentity,
        snapshotSize,
        leafUuid,
        firstRecordUuid,
        physicalRecords,
        runtimeUuids,
        replayUuids,
        goalStatePositions,
        gaps,
        restoreStartTime,
        startTime,
        lastUpdated,
        byUuid,
        branchPointsByAssistantUuid,
    };
}
async function getCachedIndex(params) {
    const now = Date.now();
    pruneCache(now);
    const key = makeCacheKey(params.filePath, params.fileIdentity, params.snapshotSize, params.lastUpdated);
    const cached = indexCache.get(key);
    if (cached?.value && cached.expiresAt > now) {
        indexCache.delete(key);
        indexCache.set(key, cached);
        debugLogger.debug(`index cache hit ${key}`);
        params.onCacheState?.('hit');
        return cached.value;
    }
    if (cached?.pending && cached.expiresAt > now) {
        debugLogger.debug(`index cache pending hit ${key}`);
        params.onCacheState?.('pending');
        return cached.pending;
    }
    debugLogger.debug(`index cache miss ${key}`);
    params.onCacheState?.('miss');
    const pending = buildIndex(params);
    indexCache.set(key, {
        pending,
        expiresAt: now + INDEX_CACHE_TTL_MS,
    });
    try {
        const value = await pending;
        const byteSize = estimateIndexCacheBytes(value);
        if (byteSize > getIndexCacheMaxBytes()) {
            if (indexCache.get(key)?.pending === pending) {
                indexCache.delete(key);
            }
            debugLogger.debug(`index cache skipped oversized entry ${key} byteSize=${byteSize}`);
            return value;
        }
        if (indexCache.get(key)?.pending !== pending) {
            debugLogger.debug(`index cache skipped stale completion ${key}`);
            return value;
        }
        if (getIndexCacheBytes() + byteSize > getIndexCacheMaxBytes()) {
            indexCache.delete(key);
            debugLogger.debug(`index cache skipped byte-budget admission ${key} byteSize=${byteSize}`);
            return value;
        }
        indexCache.set(key, {
            value,
            byteSize,
            expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
        });
        pruneCache();
        return value;
    }
    catch (error) {
        if (indexCache.get(key)?.pending === pending) {
            indexCache.delete(key);
        }
        debugLogger.debug(`index cache build failed ${key}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
function makeReplayIndex(index, hideInheritedHistory) {
    const replayUuids = hideInheritedHistory
        ? index.replayUuids.filter((uuid) => index.byUuid.get(uuid)?.inherited !== true)
        : index.replayUuids;
    if (replayUuids === index.replayUuids)
        return index;
    const goalStatePositions = [];
    for (let position = 0; position < replayUuids.length; position++) {
        const entry = index.byUuid.get(replayUuids[position]);
        if (entry?.type === 'system' && entry.subtype === 'goal_state') {
            goalStatePositions.push(position);
        }
    }
    return { ...index, replayUuids, goalStatePositions };
}
function selectRestoreReplayUuids(index, sessionId, replay) {
    if (replay.kind === 'none')
        return undefined;
    const replayIndex = makeReplayIndex(index, replay.hideInheritedHistory);
    if (replay.kind === 'all') {
        return {
            index: replayIndex,
            uuids: replayIndex.replayUuids,
            hasMore: false,
            nextPosition: 0,
        };
    }
    const limit = normalizeLimit(replay.limit);
    const selected = selectBackwardPageUuids(replayIndex, sessionId, replayIndex.replayUuids.length, limit, SESSION_TRANSCRIPT_MAX_PAGE_BYTES);
    return {
        index: replayIndex,
        uuids: selected.uuids,
        hasMore: selected.nextPosition > 0,
        nextPosition: selected.nextPosition,
    };
}
function validateRestoreReplaySelection(replay) {
    if (replay.kind === 'recent')
        normalizeLimit(replay.limit);
}
async function assertIndexSnapshotUnchanged(index, sessionId) {
    if (!(await hasSnapshotSignature(index.filePath, index.fileIdentity, index.snapshotSize, index.lastUpdated))) {
        throw new SessionTranscriptSnapshotUnavailableError(sessionId);
    }
}
async function hasSnapshotSignature(filePath, fileIdentity, snapshotSize, lastUpdated) {
    let stats;
    try {
        stats = await fsp.stat(filePath);
    }
    catch (error) {
        if (isFileMissingError(error))
            return false;
        throw error;
    }
    return (stats.size === snapshotSize &&
        sameFileIdentity(fileIdentityFromStats(stats), fileIdentity) &&
        new Date(stats.mtimeMs).toISOString() === lastUpdated);
}
function offerFreshIndexToCache(index) {
    pruneCache();
    const key = makeCacheKey(index.filePath, index.fileIdentity, index.snapshotSize, index.lastUpdated);
    if (indexCache.has(key))
        return;
    const byteSize = estimateIndexCacheBytes(index);
    if (byteSize > getIndexCacheMaxBytes() ||
        getIndexCacheBytes() + byteSize > getIndexCacheMaxBytes() ||
        indexCache.size >= INDEX_CACHE_MAX_ENTRIES) {
        debugLogger.debug(`fresh index cache offer skipped ${key} byteSize=${byteSize}`);
        return;
    }
    indexCache.set(key, {
        value: index,
        byteSize,
        expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
    });
}
function lastUuidMatching(index, predicate) {
    for (let position = index.runtimeUuids.length - 1; position >= 0; position--) {
        const uuid = index.runtimeUuids[position];
        const entry = index.byUuid.get(uuid);
        if (entry && predicate(entry))
            return uuid;
    }
    return undefined;
}
function selectArtifactUuids(index) {
    return selectActiveSideArtifactRecordUuids(index.physicalRecords, index.runtimeUuids);
}
export class SessionTranscriptReader {
    workspaceCwd;
    cursorCodec;
    storage;
    constructor(workspaceCwd, cursorCodec, runtimeBaseDir) {
        this.workspaceCwd = workspaceCwd;
        this.cursorCodec = cursorCodec;
        this.storage = new Storage(workspaceCwd, runtimeBaseDir);
    }
    getSessionFilePath(sessionId) {
        if (!SESSION_TRANSCRIPT_SESSION_ID_PATTERN.test(sessionId)) {
            debugLogger.debug(`invalid session id for transcript read: ${sessionId}`);
            throw makeSessionTranscriptNotFoundError(sessionId);
        }
        return path.join(this.storage.getProjectDir(), 'chats', `${sessionId}.jsonl`);
    }
    async readRestoreProjection(sessionId, options, readOptions = {}) {
        const filePath = this.getSessionFilePath(sessionId);
        validateRestoreReplaySelection(options.replay);
        addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.replay_mode', options.replay.kind);
        addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.index_cache_state', 'fresh');
        let stats;
        try {
            stats = await fsp.stat(filePath);
        }
        catch (error) {
            if (isFileMissingError(error)) {
                throw new SessionTranscriptSnapshotUnavailableError(sessionId);
            }
            throw error;
        }
        const fileIdentity = fileIdentityFromStats(stats);
        const lastUpdated = new Date(stats.mtimeMs).toISOString();
        let index;
        const indexStartedAt = performance.now();
        try {
            index = await buildIndex({
                filePath,
                fileIdentity,
                snapshotSize: stats.size,
                lastUpdated,
            });
        }
        catch (error) {
            if (error instanceof EmptySessionTranscriptError) {
                if (await hasSnapshotSignature(filePath, fileIdentity, stats.size, lastUpdated)) {
                    return undefined;
                }
            }
            throw error;
        }
        finally {
            recordRestoreStage('transcript_index', indexStartedAt);
        }
        recordRestoreIndexAttributes(index);
        const selectionStartedAt = performance.now();
        let replaySelection;
        try {
            replaySelection = selectRestoreReplayUuids(index, sessionId, options.replay);
        }
        finally {
            recordRestoreStage('resume_state_select', selectionStartedAt);
        }
        const replaySet = new Set(replaySelection?.uuids ?? []);
        const modelSet = new Set();
        let compressionPosition = -1;
        for (let position = 0; position < index.runtimeUuids.length; position++) {
            const entry = index.byUuid.get(index.runtimeUuids[position]);
            if (entry?.apiHistoryCompressionCandidate) {
                compressionPosition = position;
            }
        }
        for (let position = 0; position < index.runtimeUuids.length; position++) {
            const uuid = index.runtimeUuids[position];
            const entry = index.byUuid.get(uuid);
            if (position === compressionPosition ||
                (entry?.type !== 'system' &&
                    (compressionPosition < 0 || position > compressionPosition))) {
                modelSet.add(uuid);
            }
        }
        addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.compression_selected', compressionPosition >= 0);
        addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.legacy_full_model_history', compressionPosition < 0);
        const tokenUuid = lastUuidMatching(index, (entry) => entry.resumeTokenCountsCandidate);
        const attributionUuid = lastUuidMatching(index, (entry) => entry.attributionSnapshotCandidate);
        const parentSessionUuid = lastUuidMatching(index, (entry) => entry.type === 'system' && entry.subtype === 'parent_session');
        const sessionSourceUuid = lastUuidMatching(index, (entry) => entry.type === 'system' && entry.subtype === 'session_source');
        const uiTelemetrySet = new Set(index.runtimeUuids.filter((uuid) => {
            const entry = index.byUuid.get(uuid);
            return entry?.type === 'system' && entry.subtype === 'ui_telemetry';
        }));
        const fileHistorySet = new Set(index.runtimeUuids.filter((uuid) => {
            const entry = index.byUuid.get(uuid);
            return (entry?.type === 'system' && entry.subtype === 'file_history_snapshot');
        }));
        const goalSet = new Set(index.runtimeUuids.filter((uuid) => index.byUuid.get(uuid)?.goalRecoveryCandidate === true));
        const replayGoalSet = new Set(replaySelection
            ? replaySelection.index.replayUuids.filter((uuid) => index.byUuid.get(uuid)?.goalRecoveryCandidate === true)
            : []);
        const artifactUuids = selectArtifactUuids(index);
        const artifactSet = new Set(artifactUuids);
        const metadataSet = new Set([parentSessionUuid, sessionSourceUuid].filter((uuid) => uuid !== undefined));
        const apiHistory = new SessionApiHistoryAccumulator();
        const resumeTokenCounts = new ResumeTokenCountsAccumulator();
        const turnState = new SessionTurnStateAccumulator(sessionId);
        for (const uuid of index.runtimeUuids) {
            const hint = index.byUuid.get(uuid)?.turnHint;
            if (hint)
                turnState.addHint(hint);
        }
        const uiTelemetryEvents = [];
        const fileHistory = new SessionFileHistoryAccumulator();
        const artifacts = new SessionArtifactSnapshotAccumulator(sessionId);
        const goalRecords = [];
        const goalStatePayloads = new Map();
        const replayRecordsByUuid = new Map();
        let attributionSnapshot;
        let parentSessionId;
        let sourceType;
        let sourceId;
        let firstRecord;
        let firstRecordSeen = false;
        let goalCheckpointAccumulator;
        let goalEvidenceSet = new Set();
        const deferredPreReadRecords = new Map();
        const dispatchRecord = (record) => {
            if (modelSet.has(record.uuid))
                apiHistory.add(record);
            if (record.uuid === tokenUuid)
                resumeTokenCounts.add(record);
            if (uiTelemetrySet.has(record.uuid)) {
                const uiEvent = record.systemPayload?.uiEvent;
                if (uiEvent)
                    uiTelemetryEvents.push(uiEvent);
            }
            if (record.uuid === attributionUuid) {
                const snapshot = record.systemPayload?.snapshot;
                if (snapshot && typeof snapshot === 'object') {
                    attributionSnapshot = snapshot;
                }
            }
            if (record.uuid === parentSessionUuid) {
                parentSessionId = record.systemPayload?.parentSessionId;
            }
            else if (record.uuid === sessionSourceUuid) {
                const payload = record.systemPayload;
                sourceType = payload?.sourceType;
                sourceId = payload?.sourceId;
            }
            if (fileHistorySet.has(record.uuid)) {
                try {
                    fileHistory.add(record);
                }
                catch (error) {
                    debugLogger.warn(`restore projection: skipping malformed file_history_snapshot: ${error}`);
                }
            }
            if (artifactSet.has(record.uuid))
                artifacts.add(record);
            if (goalEvidenceSet.has(record.uuid)) {
                goalCheckpointAccumulator?.capture(record);
            }
            if (replaySet.has(record.uuid)) {
                replayRecordsByUuid.set(record.uuid, record);
            }
        };
        const preReadUuids = Array.from(new Set([
            index.firstRecordUuid,
            ...index.runtimeUuids.filter((uuid) => goalSet.has(uuid)),
        ]));
        const selectedReadsStartedAt = performance.now();
        const selectedReadSet = new Set(preReadUuids);
        let goalRecovery;
        try {
            goalRecovery = await withAggregatedRecordReadContext(index, async (readContext) => {
                await forEachAggregatedRecord(index, preReadUuids, async (record) => {
                    if (record.uuid === index.firstRecordUuid) {
                        if (readOptions.validateFirstRecord &&
                            !(await readOptions.validateFirstRecord(record))) {
                            throw new SessionTranscriptSnapshotUnavailableError(sessionId);
                        }
                        firstRecordSeen = true;
                        if (!goalSet.has(record.uuid))
                            firstRecord = record;
                    }
                    if (goalSet.has(record.uuid)) {
                        const normalized = normalizeGoalRecoveryRecord(record);
                        if (normalized) {
                            goalRecords.push(normalized);
                            if (record.subtype === 'goal_state') {
                                goalStatePayloads.set(record.uuid, parseGoalStateRecordPayloadV2(normalized.systemPayload));
                            }
                        }
                    }
                    if (replaySet.has(record.uuid)) {
                        replayRecordsByUuid.set(record.uuid, record);
                    }
                    const needsDeferredDispatch = modelSet.has(record.uuid) ||
                        record.uuid === tokenUuid ||
                        record.uuid === attributionUuid ||
                        metadataSet.has(record.uuid) ||
                        uiTelemetrySet.has(record.uuid) ||
                        fileHistorySet.has(record.uuid) ||
                        artifactSet.has(record.uuid);
                    if (needsDeferredDispatch) {
                        if (record.uuid === index.firstRecordUuid &&
                            artifactSet.has(record.uuid)) {
                            artifacts.add(record);
                        }
                        else {
                            deferredPreReadRecords.set(record.uuid, record);
                        }
                    }
                }, readContext);
                if (!firstRecordSeen) {
                    throw new SessionTranscriptSnapshotUnavailableError(sessionId);
                }
                const selectedGoalRecovery = selectGoalRecoveryFromRecords(goalRecords);
                const pendingGoal = selectedGoalRecovery.recovery.kind === 'v2'
                    ? selectedGoalRecovery.recovery.payload
                    : undefined;
                const pendingCheckpoint = pendingGoal?.checkpointPending;
                if (pendingCheckpoint && pendingGoal.snapshot.goal) {
                    try {
                        goalCheckpointAccumulator = new GoalEvidenceCheckpointAccumulator(index.runtimeUuids.map((uuid) => index.byUuid.get(uuid).goalEvidenceHint), pendingGoal.snapshot.goal, pendingCheckpoint.permit);
                    }
                    catch (error) {
                        if (!(error instanceof EvidenceSourceUnavailableError)) {
                            throw error;
                        }
                        debugLogger.warn(`restore projection: deferring unavailable Goal checkpoint evidence: ${error.message}`);
                    }
                }
                goalEvidenceSet = new Set(goalCheckpointAccumulator?.getCandidateUuids() ?? []);
                if (firstRecord && goalEvidenceSet.has(firstRecord.uuid)) {
                    goalCheckpointAccumulator?.capture(firstRecord);
                }
                firstRecord = undefined;
                const selectedRuntimeUuids = index.runtimeUuids.filter((uuid) => modelSet.has(uuid) ||
                    uuid === tokenUuid ||
                    uuid === attributionUuid ||
                    metadataSet.has(uuid) ||
                    uiTelemetrySet.has(uuid) ||
                    fileHistorySet.has(uuid) ||
                    replaySet.has(uuid) ||
                    goalEvidenceSet.has(uuid));
                const preReadSet = new Set(preReadUuids);
                readContext.preloadedRecords = deferredPreReadRecords;
                const remainingUuids = Array.from(new Set([...selectedRuntimeUuids, ...artifactUuids])).filter((uuid) => !preReadSet.has(uuid) || deferredPreReadRecords.has(uuid));
                for (const uuid of remainingUuids)
                    selectedReadSet.add(uuid);
                await forEachAggregatedRecord(index, remainingUuids, dispatchRecord, readContext);
                let goalCheckpointWindow;
                try {
                    goalCheckpointWindow = goalCheckpointAccumulator?.finish();
                }
                catch (error) {
                    if (!(error instanceof InvalidGoalEvidenceReferenceError)) {
                        throw error;
                    }
                    debugLogger.warn(`restore projection: deferring invalid Goal checkpoint evidence: ${error.message}`);
                }
                return { selectedGoalRecovery, goalCheckpointWindow };
            });
        }
        finally {
            recordRestoreStage('selected_record_read', selectedReadsStartedAt);
        }
        recordRestoreSelectionAttributes(index, selectedReadSet, replaySet);
        let persistedTitle;
        try {
            persistedTitle = readSessionTitleInfoFromFileSync(index.filePath);
        }
        catch (error) {
            if (isFileMissingError(error)) {
                throw new SessionTranscriptSnapshotUnavailableError(sessionId);
            }
            throw error;
        }
        const customTitle = persistedTitle.title;
        const titleSource = persistedTitle.source;
        const turnStateValue = turnState.finish();
        const replayRecords = replaySelection
            ? replaySelection.uuids
                .map((uuid) => replayRecordsByUuid.get(uuid))
                .filter((record) => record !== undefined)
            : [];
        const replayGoalRecords = replaySelection
            ? goalRecords.filter((record) => replayGoalSet.has(record.uuid))
            : [];
        const replayGoalRecoverySourceUuid = replaySelection
            ? selectGoalRecoveryFromRecords(replayGoalRecords).sourceUuid
            : goalRecovery.selectedGoalRecovery.sourceUuid;
        let replay;
        if (replaySelection) {
            const goalStatePosition = replaySelection.index.goalStatePositions.findLast((position) => position < replaySelection.nextPosition);
            const goalStateUuid = goalStatePosition === undefined
                ? undefined
                : replaySelection.index.replayUuids[goalStatePosition];
            const goalState = goalStateUuid
                ? goalStatePayloads.get(goalStateUuid)
                : undefined;
            replay = {
                records: replayRecords,
                gaps: index.gaps,
                hasMore: replaySelection.hasMore,
                ...(replaySelection.hasMore && replayRecords[0]
                    ? { anchorRecordId: replayRecords[0].uuid }
                    : {}),
                ...(replayGoalRecoverySourceUuid &&
                    !replaySet.has(replayGoalRecoverySourceUuid)
                    ? { goalBootstrapRecords: replayGoalRecords }
                    : {}),
                ...(replayGoalRecoverySourceUuid
                    ? { goalRecoverySourceUuid: replayGoalRecoverySourceUuid }
                    : {}),
                ...(goalState
                    ? {
                        replay: {
                            goalState: goalState.snapshot,
                            goalCause: goalState.cause,
                        },
                    }
                    : {}),
            };
        }
        const restoredTokenCounts = resumeTokenCounts.finish();
        const restoredFileHistory = fileHistory.finish();
        const artifactSnapshot = artifacts.finish();
        const runtime = {
            apiHistory: apiHistory.finish(),
            ...(restoredTokenCounts
                ? { resumeTokenCounts: restoredTokenCounts }
                : {}),
            uiTelemetryEvents,
            ...(attributionSnapshot ? { attributionSnapshot } : {}),
            ...(index.gaps.length > 0 ? { historyGaps: index.gaps } : {}),
            recording: {
                lastCompletedUuid: index.leafUuid,
                turnParentUuids: turnStateValue.turnParentUuids,
                ...(customTitle !== undefined ? { customTitle } : {}),
                ...(titleSource !== undefined ? { titleSource } : {}),
                ...(parentSessionId !== undefined ? { parentSessionId } : {}),
                ...(sourceType !== undefined ? { sourceType } : {}),
                ...(sourceId !== undefined ? { sourceId } : {}),
            },
            ...(restoredFileHistory
                ? { fileHistorySnapshots: restoredFileHistory }
                : {}),
            ...(artifactSnapshot ? { artifactSnapshot } : {}),
            goalRecords,
            ...(goalRecovery.selectedGoalRecovery.sourceUuid
                ? {
                    goalRecoverySourceUuid: goalRecovery.selectedGoalRecovery.sourceUuid,
                }
                : {}),
            ...(goalRecovery.goalCheckpointWindow
                ? { goalCheckpointWindow: goalRecovery.goalCheckpointWindow }
                : {}),
            initialTurn: turnStateValue.initialTurn,
            backgroundNotificationTaskIds: turnStateValue.backgroundNotificationTaskIds,
        };
        await assertIndexSnapshotUnchanged(index, sessionId);
        offerFreshIndexToCache(index);
        return {
            sessionId,
            filePath,
            startTime: index.restoreStartTime,
            lastUpdated: index.lastUpdated,
            runtime,
            ...(replay ? { replay } : {}),
        };
    }
    async readLiveRestoreProjection(sessionId, options, readOptions = {}) {
        const filePath = this.getSessionFilePath(sessionId);
        validateRestoreReplaySelection(options.replay);
        addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.replay_mode', options.replay.kind);
        let stats;
        try {
            stats = await fsp.stat(filePath);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
        let index;
        const fileIdentity = fileIdentityFromStats(stats);
        const lastUpdated = new Date(stats.mtimeMs).toISOString();
        const indexStartedAt = performance.now();
        try {
            index = await getCachedIndex({
                filePath,
                fileIdentity,
                snapshotSize: stats.size,
                lastUpdated,
                onCacheState: (state) => addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.index_cache_state', state),
            });
        }
        catch (error) {
            if (error instanceof EmptySessionTranscriptError) {
                if (await hasSnapshotSignature(filePath, fileIdentity, stats.size, lastUpdated)) {
                    return undefined;
                }
            }
            throw error;
        }
        finally {
            recordRestoreStage('transcript_index', indexStartedAt);
        }
        recordRestoreIndexAttributes(index);
        const selectionStartedAt = performance.now();
        const replaySelection = selectRestoreReplayUuids(index, sessionId, options.replay);
        const replaySet = new Set(replaySelection?.uuids ?? []);
        const goalSet = new Set(replaySelection
            ? replaySelection.index.replayUuids.filter((uuid) => index.byUuid.get(uuid)?.goalRecoveryCandidate === true)
            : []);
        const goalStatePosition = replaySelection
            ? replaySelection.index.goalStatePositions.findLast((position) => position < replaySelection.nextPosition)
            : undefined;
        const goalStateUuid = goalStatePosition === undefined || !replaySelection
            ? undefined
            : replaySelection.index.replayUuids[goalStatePosition];
        const goalStateSet = new Set(goalStateUuid ? [goalStateUuid] : []);
        const artifactUuids = selectArtifactUuids(index);
        const artifactSet = new Set(artifactUuids);
        const selectedRuntimeUuids = index.runtimeUuids.filter((uuid) => replaySet.has(uuid) || goalStateSet.has(uuid) || goalSet.has(uuid));
        if (!selectedRuntimeUuids.includes(index.firstRecordUuid)) {
            selectedRuntimeUuids.unshift(index.firstRecordUuid);
        }
        const replayRecords = [];
        const goalRecords = [];
        const goalStatePayloads = new Map();
        const artifacts = new SessionArtifactSnapshotAccumulator(sessionId);
        recordRestoreStage('resume_state_select', selectionStartedAt);
        const selectedReadSet = new Set([
            ...selectedRuntimeUuids,
            ...artifactUuids,
        ]);
        const selectedReadsStartedAt = performance.now();
        try {
            await forEachAggregatedRecord(index, [...selectedReadSet], async (record) => {
                if (record.uuid === index.firstRecordUuid &&
                    readOptions.validateFirstRecord &&
                    !(await readOptions.validateFirstRecord(record))) {
                    throw new SessionTranscriptSnapshotUnavailableError(sessionId);
                }
                if (replaySet.has(record.uuid))
                    replayRecords.push(record);
                if (goalStateSet.has(record.uuid)) {
                    goalStatePayloads.set(record.uuid, parseGoalStateRecordPayloadV2(record.systemPayload));
                }
                if (goalSet.has(record.uuid)) {
                    const normalized = normalizeGoalRecoveryRecord(record);
                    if (normalized)
                        goalRecords.push(normalized);
                }
                if (artifactSet.has(record.uuid))
                    artifacts.add(record);
            });
        }
        finally {
            recordRestoreStage('selected_record_read', selectedReadsStartedAt);
        }
        recordRestoreSelectionAttributes(index, selectedReadSet, replaySet);
        let replay;
        if (replaySelection) {
            const goalState = goalStateUuid
                ? goalStatePayloads.get(goalStateUuid)
                : undefined;
            replay = {
                records: replayRecords,
                gaps: index.gaps,
                hasMore: replaySelection.hasMore,
                ...(replaySelection.hasMore && replayRecords[0]
                    ? { anchorRecordId: replayRecords[0].uuid }
                    : {}),
                ...(goalState
                    ? {
                        replay: {
                            goalState: goalState.snapshot,
                            goalCause: goalState.cause,
                        },
                    }
                    : {}),
            };
        }
        const artifactSnapshot = artifacts.finish();
        const goalRecovery = selectGoalRecoveryFromRecords(goalRecords);
        const replayGoalRecoverySourceUuid = goalRecovery.sourceUuid &&
            replaySelection?.index.replayUuids.includes(goalRecovery.sourceUuid)
            ? goalRecovery.sourceUuid
            : undefined;
        await assertIndexSnapshotUnchanged(index, sessionId);
        return {
            sessionId,
            startTime: index.restoreStartTime,
            lastUpdated: index.lastUpdated,
            ...(replay ? { replay } : {}),
            ...(artifactSnapshot ? { artifactSnapshot } : {}),
            ...(goalRecords.length > 0 ? { goalRecords } : {}),
            ...(replayGoalRecoverySourceUuid
                ? { goalRecoverySourceUuid: replayGoalRecoverySourceUuid }
                : {}),
        };
    }
    async readPage(sessionId, options = {}) {
        const limit = normalizeLimit(options.limit);
        const maxBytes = normalizeMaxBytes(options.maxBytes);
        const cursor = options.cursor !== undefined
            ? (this.cursorCodec?.decode(options.cursor) ??
                decodeSessionTranscriptCursor(options.cursor, this.workspaceCwd))
            : undefined;
        if (cursor &&
            (options.beforeRecordId !== undefined || options.direction !== undefined)) {
            throw new InvalidSessionTranscriptCursorError();
        }
        if (cursor && cursor.sessionId !== sessionId) {
            debugLogger.debug(`cursor session mismatch requested=${sessionId} cursor=${cursor.sessionId}`);
            throw new InvalidSessionTranscriptCursorError();
        }
        const filePath = this.getSessionFilePath(sessionId);
        const stats = await fsp.stat(filePath);
        const currentIdentity = fileIdentityFromStats(stats);
        const snapshotSize = cursor?.snapshotSize ?? stats.size;
        const fileIdentity = cursor?.fileIdentity ?? currentIdentity;
        if (stats.size < snapshotSize ||
            !sameFileIdentity(currentIdentity, fileIdentity)) {
            debugLogger.warn(`snapshot unavailable session=${sessionId} ` +
                `currentSize=${stats.size} cursorSize=${snapshotSize} ` +
                `currentIdentity=${currentIdentity.dev}:${currentIdentity.ino} ` +
                `cursorIdentity=${fileIdentity.dev}:${fileIdentity.ino}`);
            throw new SessionTranscriptSnapshotUnavailableError(sessionId);
        }
        const index = await getCachedIndex({
            filePath,
            fileIdentity,
            snapshotSize,
            lastUpdated: cursor?.lastUpdated ?? new Date(stats.mtimeMs).toISOString(),
        });
        if (cursor && cursor.leafUuid !== index.leafUuid) {
            debugLogger.warn(`snapshot unavailable: leaf changed session=${sessionId} ` +
                `cursorLeaf=${cursor.leafUuid} indexLeaf=${index.leafUuid}`);
            throw new SessionTranscriptSnapshotUnavailableError(sessionId);
        }
        const direction = cursor?.direction ??
            options.direction ??
            (options.beforeRecordId !== undefined ? 'backward' : 'forward');
        let position = cursor?.position ??
            (direction === 'backward' ? index.replayUuids.length : 0);
        if (!cursor && options.beforeRecordId !== undefined) {
            if (options.beforeRecordId.length === 0) {
                throw new InvalidSessionTranscriptCursorError();
            }
            position = index.replayUuids.indexOf(options.beforeRecordId);
            if (position < 0) {
                throw new InvalidSessionTranscriptCursorError();
            }
        }
        if (position > index.replayUuids.length) {
            debugLogger.debug(`cursor position out of range session=${sessionId} ` +
                `position=${position} replay=${index.replayUuids.length}`);
            throw new InvalidSessionTranscriptCursorError();
        }
        const backwardPage = direction === 'backward'
            ? selectBackwardPageUuids(index, sessionId, position, limit, maxBytes)
            : undefined;
        const pageUuids = backwardPage?.uuids ?? selectPageUuids(index, position, limit, maxBytes);
        const nextPosition = backwardPage?.nextPosition ?? position + pageUuids.length;
        const records = await readAggregatedRecords(index, pageUuids);
        // Null prototype: record uuids are untrusted, and '__proto__' would
        // silently drop the entry on a plain object.
        const pageBranchPoints = Object.create(null);
        for (const record of records) {
            const checkpointUuid = index.branchPointsByAssistantUuid.get(record.uuid);
            if (checkpointUuid !== undefined) {
                pageBranchPoints[record.uuid] = checkpointUuid;
            }
        }
        const backwardGoalState = direction === 'backward'
            ? await readGoalStatePayloadBeforePosition(index, nextPosition)
            : undefined;
        const hasMore = direction === 'backward'
            ? nextPosition > 0
            : nextPosition < index.replayUuids.length;
        const nextCursorState = hasMore
            ? {
                v: SESSION_TRANSCRIPT_CURSOR_VERSION,
                sessionId,
                fileIdentity,
                snapshotSize,
                position: nextPosition,
                ...(direction === 'backward'
                    ? { direction: 'backward' }
                    : {}),
                leafUuid: index.leafUuid,
                startTime: index.startTime,
                lastUpdated: index.lastUpdated,
            }
            : undefined;
        debugLogger.debug(`read page session=${sessionId} position=${position} ` +
            `nextPosition=${nextPosition} records=${records.length} ` +
            `hasMore=${hasMore}`);
        return {
            sessionId,
            filePath,
            records,
            gaps: index.gaps,
            hasMore,
            ...(direction === 'backward' ? { direction: 'backward' } : {}),
            ...(nextCursorState ? { nextCursorState } : {}),
            ...(backwardGoalState
                ? {
                    replay: {
                        goalState: backwardGoalState.snapshot,
                        goalCause: backwardGoalState.cause,
                    },
                }
                : cursor?.replay !== undefined
                    ? { replay: cursor.replay }
                    : {}),
            startTime: index.startTime,
            lastUpdated: index.lastUpdated,
            ...(Object.keys(pageBranchPoints).length > 0
                ? { branchPointsByAssistantUuid: pageBranchPoints }
                : {}),
        };
    }
}
export function resetSessionTranscriptIndexCacheForTest() {
    indexCache.clear();
    cursorHmacKeys.clear();
    indexCacheMaxBytesForTest = undefined;
    expandedPageBytesForTest = undefined;
    cooperativeReadByteBudgetForTest = undefined;
    cooperativeReadTimeBudgetMsForTest = undefined;
    cooperativeYieldHookForTest = undefined;
    selectedLineReadHookForTest = undefined;
    indexBuildCompleteHookForTest = undefined;
}
export function clearSessionTranscriptIndexCacheEntriesForTest() {
    indexCache.clear();
}
export function setSessionTranscriptCooperativeReadBudgetForTest(byteBudget, timeBudgetMs, onYield) {
    cooperativeReadByteBudgetForTest = byteBudget;
    cooperativeReadTimeBudgetMsForTest = timeBudgetMs;
    cooperativeYieldHookForTest = onYield;
}
export function setSessionTranscriptIndexBuildCompleteHookForTest(hook) {
    indexBuildCompleteHookForTest = hook;
}
export function setSessionTranscriptSelectedLineReadHookForTest(hook) {
    selectedLineReadHookForTest = hook;
}
export function setSessionTranscriptIndexCacheMaxBytesForTest(maxBytes) {
    indexCacheMaxBytesForTest = maxBytes;
    pruneCache();
}
export function setSessionTranscriptExpandedPageBytesForTest(maxBytes) {
    expandedPageBytesForTest = maxBytes;
}
export function getSessionTranscriptIndexCacheStatsForTest() {
    return {
        entries: indexCache.size,
        byteSize: getIndexCacheBytes(),
    };
}
//# sourceMappingURL=session-transcript-reader.js.map