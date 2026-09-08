/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatRecord, GoalSnapshotV2, GoalStateCause, HistoryGap } from '@lailatul-coder/lailatul-coder-core';
import { type TranscriptReplayStateV1 } from '@lailatul-coder/acp-bridge/transcriptReplay';
import type { SessionEmitterContext } from './types.js';
export declare const MISSING_TOOL_RESULT_MESSAGE: string;
export interface PendingReplayToolCall {
    callId: string;
    toolName: string;
    timestamp?: string;
    recordId: string;
}
export interface HistoryReplayPageOptions {
    pendingToolCalls?: PendingReplayToolCall[];
    finalizeDangling?: boolean;
    gaps?: HistoryGap[];
    goalState?: GoalSnapshotV2;
    goalCause?: GoalStateCause;
}
export interface HistoryReplayPageState {
    pendingToolCalls: PendingReplayToolCall[];
    replay: TranscriptReplayStateV1;
}
export interface HistoryReplayGoalBootstrap {
    goalStatus: {
        kind: 'set' | 'checking';
        condition: string;
        iterations?: number;
        setAt?: number;
        durationMs?: number;
        lastReason?: string;
    };
    goalState?: GoalSnapshotV2;
}
/**
 * Handles replaying session history on session load.
 *
 * Uses the unified emitters to ensure consistency with normal flow.
 * This ensures that replayed history looks identical to how it would
 * have appeared during the original session.
 */
export declare class HistoryReplayer {
    private readonly ctx;
    private readonly toolCallEmitter;
    private machine;
    constructor(ctx: SessionEmitterContext);
    replay(records: ChatRecord[], gaps?: HistoryGap[], options?: {
        initialGoalState?: GoalSnapshotV2;
        initialGoalCause?: GoalStateCause;
        goalBootstrap?: HistoryReplayGoalBootstrap;
    }): Promise<void>;
    static v2GoalBootstrap(rawGoalState: unknown, rawGoalCause: unknown): HistoryReplayGoalBootstrap | undefined;
    replayPage(records: ChatRecord[], options?: HistoryReplayPageOptions): Promise<HistoryReplayPageState>;
    getPendingToolCalls(): PendingReplayToolCall[];
    getReplayState(): TranscriptReplayStateV1;
    private createMachine;
    private presentationAdapter;
    private sendUpdate;
    private copyCumulativeUsage;
    private setActiveRecordId;
}
