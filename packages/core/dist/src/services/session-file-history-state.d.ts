/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatRecord } from './chatRecordingService.js';
import { type FileHistorySnapshot } from './fileHistoryService.js';
export declare class SessionFileHistoryAccumulator {
    private readonly seenPromptIds;
    private readonly retainedPromptIds;
    private readonly snapshotsByPromptId;
    add(record: Pick<ChatRecord, 'type' | 'subtype' | 'systemPayload'>): void;
    finish(): FileHistorySnapshot[] | undefined;
}
