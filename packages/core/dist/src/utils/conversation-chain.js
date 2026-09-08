/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import { isTranscriptConversationRecord, selectTranscriptLeaf, walkTranscriptUuidChain, } from './transcript-records.js';
/**
 * Linearizes tree-structured session records into an ordered uuid chain by
 * walking `parentUuid` back from the newest leaf to a null root.
 *
 * On a genuinely missing parent the walk stops (as it always has). With
 * `detectGaps` it additionally records the break so the caller can mark it;
 * it never guesses an earlier island to reconnect.
 */
export function buildOrderedUuidChain(records, opts) {
    if (records.length === 0)
        return { uuids: [], gaps: [] };
    const detectGaps = opts?.detectGaps ?? false;
    const transcriptRecords = records;
    const firstByUuid = new Map();
    for (const r of records) {
        if (isTranscriptConversationRecord(r) && !firstByUuid.has(r.uuid)) {
            firstByUuid.set(r.uuid, r);
        }
    }
    const startUuid = selectTranscriptLeaf(transcriptRecords, opts?.leafUuid);
    if (!startUuid)
        return { uuids: [], gaps: [] };
    const chain = walkTranscriptUuidChain(startUuid, (uuid) => firstByUuid.get(uuid));
    return {
        uuids: [...chain.uuids],
        gaps: detectGaps ? [...chain.gaps] : [],
    };
}
//# sourceMappingURL=conversation-chain.js.map