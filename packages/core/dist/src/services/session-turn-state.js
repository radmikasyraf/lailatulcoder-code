/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export class SessionTurnStateAccumulator {
    sessionId;
    maxPromptTurn = 0;
    userMessageCount = 0;
    turnParentUuids = [];
    backgroundNotificationTaskIds = new Set();
    constructor(sessionId) {
        this.sessionId = sessionId;
    }
    add(record) {
        this.addHint(getSessionTurnRecordHint(record, this.sessionId));
    }
    addHint(hint) {
        if (hint.countsAsUserPrompt) {
            this.userMessageCount += 1;
        }
        if (hint.promptTurn !== undefined) {
            this.maxPromptTurn = Math.max(this.maxPromptTurn, hint.promptTurn);
        }
        if (hint.turnParentUuid !== undefined) {
            this.turnParentUuids.push(hint.turnParentUuid);
        }
        if (hint.backgroundNotificationTaskId !== undefined) {
            this.backgroundNotificationTaskIds.add(hint.backgroundNotificationTaskId);
        }
    }
    finish() {
        return {
            initialTurn: this.maxPromptTurn > 0 ? this.maxPromptTurn : this.userMessageCount,
            turnParentUuids: [...this.turnParentUuids],
            backgroundNotificationTaskIds: [...this.backgroundNotificationTaskIds],
        };
    }
}
export function getSessionTurnRecordHint(record, sessionId) {
    let promptTurn;
    for (const promptId of getRecordPromptIds(record)) {
        const candidate = parseSessionPromptTurn(promptId, sessionId);
        if (candidate !== undefined) {
            promptTurn = Math.max(promptTurn ?? 0, candidate);
        }
    }
    const turnParentUuid = record.type === 'user' &&
        record.subtype !== 'goal_runtime' &&
        record.subtype !== 'notification' &&
        record.subtype !== 'cron' &&
        record.subtype !== 'mid_turn_user_message' &&
        record.subtype !== 'realtime_message'
        ? (record.parentUuid ?? null)
        : undefined;
    const backgroundTask = record.subtype === 'notification'
        ? record.systemPayload?.backgroundTask
        : undefined;
    return {
        ...(promptTurn !== undefined ? { promptTurn } : {}),
        countsAsUserPrompt: record.sessionId === sessionId && isUserPromptRecord(record),
        ...(turnParentUuid !== undefined ? { turnParentUuid } : {}),
        ...(typeof backgroundTask?.taskId === 'string'
            ? { backgroundNotificationTaskId: backgroundTask.taskId }
            : {}),
    };
}
export function collectSessionTurnState(records, sessionId) {
    const accumulator = new SessionTurnStateAccumulator(sessionId);
    for (const record of records)
        accumulator.add(record);
    return accumulator.finish();
}
export function computeInitialTurnFromHistory(records, sessionId) {
    return collectSessionTurnState(records, sessionId).initialTurn;
}
function getRecordPromptIds(record) {
    const promptIds = [];
    const recordPromptId = record.promptId;
    if (typeof recordPromptId === 'string')
        promptIds.push(recordPromptId);
    const telemetryPromptId = readTelemetryPromptId(record.systemPayload);
    if (telemetryPromptId)
        promptIds.push(telemetryPromptId);
    return promptIds;
}
function readTelemetryPromptId(payload) {
    if (!payload || typeof payload !== 'object' || !('uiEvent' in payload)) {
        return undefined;
    }
    const uiEvent = payload.uiEvent;
    if (!uiEvent || typeof uiEvent !== 'object' || !('prompt_id' in uiEvent)) {
        return undefined;
    }
    const promptId = uiEvent.prompt_id;
    return typeof promptId === 'string' ? promptId : undefined;
}
function parseSessionPromptTurn(promptId, sessionId) {
    const promptIdPrefix = `${sessionId}########`;
    if (!promptId.startsWith(promptIdPrefix))
        return undefined;
    const suffix = promptId.slice(promptIdPrefix.length);
    return /^\d+$/.test(suffix) ? Number(suffix) : undefined;
}
function isUserPromptRecord(record) {
    if (record.type !== 'user' || record.subtype === 'realtime_message') {
        return false;
    }
    return (record.message?.parts?.some((part) => typeof part.text === 'string' && part.text.trim().length > 0) ?? false);
}
//# sourceMappingURL=session-turn-state.js.map