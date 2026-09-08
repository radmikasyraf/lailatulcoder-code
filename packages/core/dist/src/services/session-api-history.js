/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
function stripThoughtsFromContent(content) {
    if (!content.parts)
        return content;
    const filteredParts = content.parts.filter((part) => !part.thought);
    if (filteredParts.length === 0)
        return null;
    return { ...content, parts: filteredParts };
}
function copyContentForApiHistory(content) {
    return {
        ...content,
        parts: content.parts?.map((part) => {
            if ('functionCall' in part && part.functionCall) {
                return {
                    ...part,
                    functionCall: {
                        ...part.functionCall,
                        args: part.functionCall.args
                            ? { ...part.functionCall.args }
                            : part.functionCall.args,
                    },
                };
            }
            if ('functionResponse' in part && part.functionResponse) {
                return {
                    ...part,
                    functionResponse: { ...part.functionResponse },
                };
            }
            return { ...part };
        }),
    };
}
function appendApiHistoryRecord(history, record) {
    if (!record.message || record.subtype === 'realtime_message')
        return;
    const message = copyContentForApiHistory(record.message);
    if (record.subtype === 'mid_turn_user_message') {
        const previous = history.at(-1);
        if (previous?.role === 'user') {
            previous.parts = [...(previous.parts ?? []), ...(message.parts ?? [])];
            return;
        }
    }
    history.push(message);
}
export class SessionApiHistoryAccumulator {
    history = [];
    compressionCandidate;
    add(record) {
        if (record.type === 'system') {
            if (!isApiHistoryCompressionCandidate(record))
                return;
            const payload = record.systemPayload;
            this.compressionCandidate = payload.compressedHistory;
            this.history = Array.isArray(payload.compressedHistory)
                ? payload.compressedHistory.map(copyContentForApiHistory)
                : [];
            return;
        }
        if (this.compressionCandidate !== undefined &&
            !Array.isArray(this.compressionCandidate)) {
            return;
        }
        appendApiHistoryRecord(this.history, record);
    }
    finish(options = {}) {
        if (this.compressionCandidate !== undefined &&
            !Array.isArray(this.compressionCandidate)) {
            return this.compressionCandidate.map(copyContentForApiHistory);
        }
        if (!options.stripThoughtsFromHistory)
            return this.history;
        return this.history
            .map(stripThoughtsFromContent)
            .filter((content) => content !== null);
    }
}
export function isApiHistoryCompressionCandidate(record) {
    if (record.type !== 'system' || record.subtype !== 'chat_compression') {
        return false;
    }
    const payload = record.systemPayload;
    return Boolean(payload?.compressedHistory);
}
export function buildApiHistoryFromConversation(conversation, options = {}) {
    const accumulator = new SessionApiHistoryAccumulator();
    for (const record of conversation.messages)
        accumulator.add(record);
    return accumulator.finish(options);
}
//# sourceMappingURL=session-api-history.js.map