/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { parseGoalSnapshotV2, parseGoalStateCause, } from '@lailatul-coder/lailatul-coder-core';
import { Buffer } from 'node:buffer';
import { projectAcpToolResultUpdate } from './acp-tool-result-text-projection.js';
import { observeAcpToolResultProjection } from '../../utils/tool-result-boundary-diagnostics.js';
import { HistoryReplayer } from './history-replayer.js';
export class HistoryReplayLimitError extends Error {
    sessionId;
    reason;
    observed;
    limit;
    constructor(sessionId, reason, observed, limit) {
        super(`Transcript replay for session ${sessionId} exceeds the ${reason} limit (${observed}, max ${limit})`);
        this.sessionId = sessionId;
        this.reason = reason;
        this.observed = observed;
        this.limit = limit;
        this.name = 'HistoryReplayLimitError';
    }
}
export function createReplayCumulativeUsage() {
    return {
        promptTokens: 0,
        cachedTokens: 0,
        candidateTokens: 0,
        apiTimeMs: 0,
    };
}
export function copyCumulativeUsage(target, source) {
    target.promptTokens = source.promptTokens;
    target.cachedTokens = source.cachedTokens;
    target.candidateTokens = source.candidateTokens;
    target.apiTimeMs = source.apiTimeMs;
}
function isObjectRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isCumulativeUsage(value) {
    if (!isObjectRecord(value))
        return false;
    return (typeof value['promptTokens'] === 'number' &&
        Number.isFinite(value['promptTokens']) &&
        typeof value['cachedTokens'] === 'number' &&
        Number.isFinite(value['cachedTokens']) &&
        typeof value['candidateTokens'] === 'number' &&
        Number.isFinite(value['candidateTokens']) &&
        typeof value['apiTimeMs'] === 'number' &&
        Number.isFinite(value['apiTimeMs']));
}
function isPendingReplayToolCall(value) {
    if (!isObjectRecord(value))
        return false;
    return (typeof value['callId'] === 'string' &&
        typeof value['toolName'] === 'string' &&
        (value['timestamp'] === undefined ||
            typeof value['timestamp'] === 'string') &&
        typeof value['recordId'] === 'string');
}
function isCurrentPendingReplayToolCall(value) {
    if (!isObjectRecord(value))
        return false;
    return (typeof value['callId'] === 'string' &&
        typeof value['toolName'] === 'string' &&
        typeof value['sourceRecordId'] === 'string' &&
        (value['sourceTimestamp'] === undefined ||
            typeof value['sourceTimestamp'] === 'string'));
}
function parseTranscriptReplayState(replay, logger) {
    if (!isObjectRecord(replay)) {
        return {
            pendingToolCalls: [],
            cumulativeUsage: createReplayCumulativeUsage(),
        };
    }
    if ('v' in replay && replay['v'] !== 1) {
        throw new TypeError('Unsupported transcript replay state version.');
    }
    const rawPending = replay['pendingToolCalls'];
    const pendingToolCalls = Array.isArray(rawPending)
        ? rawPending.flatMap((pending) => {
            if (isPendingReplayToolCall(pending))
                return [pending];
            if (isCurrentPendingReplayToolCall(pending)) {
                return [
                    {
                        callId: pending.callId,
                        toolName: pending.toolName,
                        recordId: pending.sourceRecordId,
                        ...(pending.sourceTimestamp
                            ? { timestamp: pending.sourceTimestamp }
                            : {}),
                    },
                ];
            }
            return [];
        })
        : [];
    if (logger &&
        Array.isArray(rawPending) &&
        pendingToolCalls.length !== rawPending.length) {
        const dropped = rawPending.length - pendingToolCalls.length;
        logger.warn(`[transcript] replay state dropped ${dropped} of ${rawPending.length} malformed pending tool calls`);
    }
    const cumulativeUsage = isCumulativeUsage(replay['cumulativeUsage'])
        ? { ...replay['cumulativeUsage'] }
        : createReplayCumulativeUsage();
    const rawGoalState = replay['goalState'];
    const goalState = rawGoalState === undefined ? undefined : parseGoalSnapshotV2(rawGoalState);
    if (logger && rawGoalState !== undefined && !goalState) {
        logger.warn('[transcript] replay state dropped a malformed Goal state');
    }
    const rawGoalCause = replay['goalCause'];
    const goalCause = rawGoalCause === undefined ? undefined : parseGoalStateCause(rawGoalCause);
    if (logger && rawGoalCause !== undefined && !goalCause) {
        logger.warn('[transcript] replay state dropped a malformed Goal cause');
    }
    return {
        pendingToolCalls,
        cumulativeUsage,
        ...(goalState ? { goalState } : {}),
        ...(goalCause ? { goalCause } : {}),
    };
}
function replayContext(sessionId, updates, cumulativeUsage, config, limits) {
    let activeRecordId = null;
    let serializedUpdateBytes = 2;
    return {
        sessionId,
        sendUpdate: async (update) => {
            const projectedUpdate = projectAcpToolResultUpdate(update);
            const updateWithRecordId = (() => {
                if (activeRecordId === null)
                    return projectedUpdate;
                const record = projectedUpdate;
                const meta = isObjectRecord(record['_meta']) ? record['_meta'] : {};
                return {
                    ...record,
                    _meta: { ...meta, 'LailatulCoder.session.recordId': activeRecordId },
                };
            })();
            const deliveredUpdate = liftSessionUpdateTimestamp(updateWithRecordId);
            observeAcpToolResultProjection(update, projectedUpdate, sessionId, deliveredUpdate);
            if (limits) {
                const updateCount = updates.length + 1;
                if (updateCount > limits.maxUpdates) {
                    throw new HistoryReplayLimitError(sessionId, 'updates', updateCount, limits.maxUpdates);
                }
                serializedUpdateBytes +=
                    (updates.length === 0 ? 0 : 1) +
                        Buffer.byteLength(JSON.stringify(deliveredUpdate), 'utf8');
                if (serializedUpdateBytes > limits.maxBytes) {
                    throw new HistoryReplayLimitError(sessionId, 'bytes', serializedUpdateBytes, limits.maxBytes);
                }
            }
            updates.push(deliveredUpdate);
        },
        setActiveRecordId: (recordId) => {
            activeRecordId = recordId;
        },
        cumulativeUsage,
        ...(config ? { config } : {}),
    };
}
export async function collectHistoryReplayUpdates({ sessionId, config, records, gaps, cumulativeUsage, logger, replayState, goalBootstrap, limits, }) {
    const updates = [];
    try {
        const initial = parseTranscriptReplayState(replayState, logger);
        await new HistoryReplayer(replayContext(sessionId, updates, cumulativeUsage, config, limits)).replay(records, gaps, {
            ...(initial.goalState ? { initialGoalState: initial.goalState } : {}),
            ...(initial.goalCause ? { initialGoalCause: initial.goalCause } : {}),
            ...(goalBootstrap ? { goalBootstrap } : {}),
        });
    }
    catch (error) {
        if (error instanceof HistoryReplayLimitError)
            throw error;
        const replayError = error instanceof Error ? error.message : String(error);
        logger?.warn('[historyReplay] History replay failed for session %s (partial updates: %d):', sessionId, updates.length, error);
        return { updates, replayError };
    }
    return { updates };
}
function liftSessionUpdateTimestamp(update) {
    const record = update;
    const meta = record['_meta'];
    const timestamp = isObjectRecord(meta) ? meta['timestamp'] : undefined;
    return typeof timestamp === 'number' || typeof timestamp === 'string'
        ? { ...record, timestamp }
        : update;
}
function readTranscriptSourceRecordIds(update) {
    const value = update;
    const meta = value['_meta'] && typeof value['_meta'] === 'object'
        ? value['_meta']
        : undefined;
    const transcript = meta?.['qwenTranscript'] && typeof meta['qwenTranscript'] === 'object'
        ? meta['qwenTranscript']
        : undefined;
    const sourceRecordIds = transcript?.['sourceRecordIds'];
    if (!Array.isArray(sourceRecordIds))
        return undefined;
    return sourceRecordIds.filter((id) => typeof id === 'string');
}
export async function replayTranscriptRecordPage({ sessionId, page, config, encodeCursor, logger, finalizeDangling = true, }) {
    const state = parseTranscriptReplayState(page.replay, logger);
    const updates = [];
    const replayer = new HistoryReplayer(replayContext(sessionId, updates, state.cumulativeUsage, config));
    let replayState;
    let replayError;
    try {
        const replayPageState = await replayer.replayPage(page.records, {
            pendingToolCalls: page.direction === 'backward' ? [] : state.pendingToolCalls,
            finalizeDangling: finalizeDangling && (page.direction === 'backward' || !page.hasMore),
            gaps: page.gaps,
            ...(state.goalState ? { goalState: state.goalState } : {}),
            ...(state.goalCause ? { goalCause: state.goalCause } : {}),
        });
        replayState = replayPageState.replay;
    }
    catch (error) {
        logger?.warn('[historyReplay] Paged history replay failed for session %s (partial updates: %d):', sessionId, updates.length, error);
        replayState = replayer.getReplayState();
        replayError = 'Replay conversion failed for this page';
    }
    if (page.branchPointsByAssistantUuid) {
        const branchPoints = page.branchPointsByAssistantUuid;
        // A checkpoint marks the END of its source record, which can replay as
        // several chunks (text/thought/text). Only the LAST visible assistant
        // chunk of the record may expose the branch point: an earlier chunk
        // would restore the record's later content when branched from, and an
        // empty-text usage chunk normalizes to `assistant.usage`, which drops
        // the metadata.
        const lastChunkIndexByRecordId = new Map();
        updates.forEach((update, index) => {
            if (update.sessionUpdate !== 'agent_message_chunk')
                return;
            const text = update.content?.text;
            if (typeof text !== 'string' || text.length === 0)
                return;
            for (const recordId of readTranscriptSourceRecordIds(update) ?? []) {
                // Own-property check: transcript record uuids are untrusted input,
                // and names like 'toString' would otherwise pass via the prototype
                // chain.
                if (Object.hasOwn(branchPoints, recordId)) {
                    lastChunkIndexByRecordId.set(recordId, index);
                }
            }
        });
        const decoratedIndexes = new Set();
        for (const [recordId, index] of lastChunkIndexByRecordId) {
            if (decoratedIndexes.has(index))
                continue;
            decoratedIndexes.add(index);
            const value = updates[index];
            const meta = value['_meta'] && typeof value['_meta'] === 'object'
                ? value['_meta']
                : undefined;
            const transcript = meta?.['qwenTranscript'] && typeof meta['qwenTranscript'] === 'object'
                ? meta['qwenTranscript']
                : undefined;
            value['_meta'] = {
                ...meta,
                qwenTranscript: {
                    ...transcript,
                    branchRecordId: branchPoints[recordId],
                },
            };
        }
    }
    const nextCursor = page.nextCursorState && replayError === undefined
        ? encodeCursor({
            ...page.nextCursorState,
            ...(page.direction === 'backward' ? {} : { replay: replayState }),
        })
        : undefined;
    return {
        updates,
        ...(nextCursor ? { nextCursor } : {}),
        hasMore: replayError === undefined && page.hasMore,
        startTime: page.startTime,
        lastUpdated: page.lastUpdated,
        ...(replayError ? { partial: true, replayError } : {}),
    };
}
//# sourceMappingURL=history-replay-page.js.map