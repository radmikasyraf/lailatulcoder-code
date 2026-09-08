/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';
const chatRecordingSuppressionContext = new AsyncLocalStorage();
export function isChatRecordingSuppressed() {
    return chatRecordingSuppressionContext.getStore() === true;
}
export function runWithChatRecordingSuppressed(fn) {
    return chatRecordingSuppressionContext.run(true, fn);
}
//# sourceMappingURL=chat-recording-suppression-context.js.map