/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { deserializeSnapshots, MAX_SNAPSHOTS, } from './fileHistoryService.js';
export class SessionFileHistoryAccumulator {
    seenPromptIds = new Set();
    retainedPromptIds = [];
    snapshotsByPromptId = new Map();
    add(record) {
        if (record.type !== 'system' ||
            record.subtype !== 'file_history_snapshot' ||
            !record.systemPayload) {
            return;
        }
        const payload = record.systemPayload;
        if (!Array.isArray(payload.snapshots))
            return;
        const deserialized = deserializeSnapshots(payload.snapshots);
        for (const snapshot of deserialized) {
            if (this.seenPromptIds.has(snapshot.promptId)) {
                if (this.snapshotsByPromptId.has(snapshot.promptId)) {
                    this.snapshotsByPromptId.set(snapshot.promptId, snapshot);
                }
                continue;
            }
            this.seenPromptIds.add(snapshot.promptId);
            this.retainedPromptIds.push(snapshot.promptId);
            this.snapshotsByPromptId.set(snapshot.promptId, snapshot);
            if (this.retainedPromptIds.length > MAX_SNAPSHOTS) {
                const evictedPromptId = this.retainedPromptIds.shift();
                this.snapshotsByPromptId.delete(evictedPromptId);
            }
        }
    }
    finish() {
        const snapshots = this.retainedPromptIds.map((promptId) => this.snapshotsByPromptId.get(promptId));
        return snapshots.length > 0 ? snapshots : undefined;
    }
}
//# sourceMappingURL=session-file-history-state.js.map