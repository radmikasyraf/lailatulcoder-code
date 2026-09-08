/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatRecord } from './chatRecordingService.js';
export type BranchPointRecord = Pick<ChatRecord, 'uuid' | 'parentUuid' | 'type' | 'subtype' | 'message' | 'systemPayload'>;
export interface BranchCheckpointRecordPayloadV1 {
    v: 1;
    startExclusiveRecordUuid: string | null;
    assistantRecordUuid: string;
}
interface BranchCandidate {
    startExclusiveRecordUuid: string | null;
    endInclusiveRecordUuid: string;
    assistantRecordUuid: string;
}
export interface BranchPoint extends BranchCandidate {
    checkpointUuid: string;
}
export interface BranchToolCallIdentity {
    id?: string;
    name?: string;
}
export declare function updatePendingBranchToolCalls(pendingCalls: BranchToolCallIdentity[], record: BranchPointRecord): void;
export declare function collectPendingBranchToolCalls(records: readonly BranchPointRecord[]): BranchToolCallIdentity[];
export declare function resolveCompletedTurnBranchCandidateFromRecords(input: {
    records: readonly BranchPointRecord[];
    startExclusiveRecordUuid: string | null;
    pendingCallsAtStart: readonly BranchToolCallIdentity[];
}): BranchCandidate | undefined;
export declare function parseBranchCheckpointPayload(value: ChatRecord['systemPayload']): BranchCheckpointRecordPayloadV1 | undefined;
export declare function resolveBranchPoints(activeChain: readonly BranchPointRecord[]): ReadonlyMap<string, BranchPoint>;
export {};
