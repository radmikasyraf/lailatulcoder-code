/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatRecord } from './chatRecordingService.js';
export interface ResumeTokenCounts {
    promptTokenCount: number;
    outputTokenCount: number;
    isEstimated: boolean;
}
export declare class ResumeTokenCountsAccumulator {
    private value;
    add(record: ChatRecord): void;
    finish(): ResumeTokenCounts | undefined;
}
export declare function isResumeTokenCountsCandidate(record: ChatRecord): boolean;
export declare function getResumeTokenCounts(conversation: {
    messages: readonly ChatRecord[];
}): ResumeTokenCounts | undefined;
export declare function getResumePromptTokenCount(conversation: {
    messages: readonly ChatRecord[];
}): number | undefined;
