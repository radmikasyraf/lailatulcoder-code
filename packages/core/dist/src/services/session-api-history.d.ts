/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { ChatRecord } from './chatRecordingService.js';
export interface BuildApiHistoryOptions {
    /**
     * Whether to strip thought parts from the history.
     * Thought parts are content parts that have `thought: true`.
     * Keeping thoughts ensures `reasoning_content` from reasoning models
     * (e.g. DeepSeek) is properly passed back in subsequent API calls.
     * @default false
     */
    stripThoughtsFromHistory?: boolean;
}
export declare class SessionApiHistoryAccumulator {
    private history;
    private compressionCandidate;
    add(record: ChatRecord): void;
    finish(options?: BuildApiHistoryOptions): Content[];
}
export declare function isApiHistoryCompressionCandidate(record: ChatRecord): boolean;
export declare function buildApiHistoryFromConversation(conversation: {
    messages: readonly ChatRecord[];
}, options?: BuildApiHistoryOptions): Content[];
