/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatRecord } from './chatRecordingService.js';
export interface SessionTurnState {
    initialTurn: number;
    turnParentUuids: Array<string | null>;
    backgroundNotificationTaskIds: string[];
}
export interface SessionTurnRecordHint {
    promptTurn?: number;
    countsAsUserPrompt: boolean;
    turnParentUuid?: string | null;
    backgroundNotificationTaskId?: string;
}
export declare class SessionTurnStateAccumulator {
    private readonly sessionId;
    private maxPromptTurn;
    private userMessageCount;
    private readonly turnParentUuids;
    private readonly backgroundNotificationTaskIds;
    constructor(sessionId: string);
    add(record: ChatRecord): void;
    addHint(hint: SessionTurnRecordHint): void;
    finish(): SessionTurnState;
}
export declare function getSessionTurnRecordHint(record: ChatRecord, sessionId: string): SessionTurnRecordHint;
export declare function collectSessionTurnState(records: readonly ChatRecord[], sessionId: string): SessionTurnState;
export declare function computeInitialTurnFromHistory(records: readonly ChatRecord[], sessionId: string): number;
