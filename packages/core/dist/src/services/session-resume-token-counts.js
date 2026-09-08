/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { getUsageOutputTokenCountForPromptEstimate } from './tokenEstimation.js';
export class ResumeTokenCountsAccumulator {
    value;
    add(record) {
        if (record.type === 'assistant') {
            const usage = record.usageMetadata;
            const candidate = usage?.promptTokenCount ?? usage?.totalTokenCount;
            if (candidate) {
                this.value = {
                    promptTokenCount: candidate,
                    outputTokenCount: getUsageOutputTokenCountForPromptEstimate(usage),
                    isEstimated: false,
                };
            }
            return;
        }
        if (record.type === 'system' && record.subtype === 'chat_compression') {
            const payload = record.systemPayload;
            if (payload?.info) {
                this.value = {
                    promptTokenCount: payload.info.newTokenCount,
                    outputTokenCount: 0,
                    isEstimated: payload.info.newTokenCountIsEstimated ?? true,
                };
            }
        }
    }
    finish() {
        return this.value;
    }
}
export function isResumeTokenCountsCandidate(record) {
    if (record.type === 'assistant') {
        const usage = record.usageMetadata;
        return Boolean(usage?.promptTokenCount ?? usage?.totalTokenCount);
    }
    if (record.type !== 'system' || record.subtype !== 'chat_compression') {
        return false;
    }
    const payload = record.systemPayload;
    return payload?.info !== undefined;
}
export function getResumeTokenCounts(conversation) {
    const accumulator = new ResumeTokenCountsAccumulator();
    for (const record of conversation.messages)
        accumulator.add(record);
    return accumulator.finish();
}
export function getResumePromptTokenCount(conversation) {
    return getResumeTokenCounts(conversation)?.promptTokenCount;
}
//# sourceMappingURL=session-resume-token-counts.js.map