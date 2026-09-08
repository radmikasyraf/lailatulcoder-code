/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { type ChatRecord, type GoalRecord, type GoalRuntime, type GoalSnapshotV2, type GoalStateCause } from '@lailatul-coder/lailatul-coder-core';
import type { HistoryReplayGoalBootstrap } from './history-replayer.js';
export interface RecoveredGoalUpdate {
    publicationKey?: string;
    suppressedGoalId?: string;
    updates: SessionUpdate[];
}
export declare function renderPreparedGoalUpdate(getRuntime: () => Promise<GoalRuntime>, options?: {
    replayedRecords?: readonly ChatRecord[];
    hideRuntimeGoal?: boolean;
    bootstrap?: HistoryReplayGoalBootstrap;
    previousGoal?: GoalRecord | null;
}): Promise<RecoveredGoalUpdate>;
export declare function goalPublicationKey(snapshot: GoalSnapshotV2, cause?: GoalStateCause): string | undefined;
