/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Debounce window for the MessageDisplay hook: bounds how often a `command`
 * hook process gets spawned per streamed reply.
 */
export const MESSAGE_DISPLAY_DEBOUNCE_MS = 200;
export function createInitialMessageDisplayState(nowMs) {
    return { displayedText: '', lastFlushMs: nowMs, lastFlushedText: '' };
}
/**
 * Decide what one streamed chunk does to the MessageDisplay accumulator,
 * PURELY (no IO, no real timer) — the seam this feature's unit tests drive.
 *
 * A flush fires when either:
 *   - `isFinal` is true (the caller is closing out this message — always
 *     flushes, even with an empty `chunk`, so the reply's tail is never
 *     dropped waiting on the debounce window), or
 *   - there is new text since the last flush AND at least `debounceMs` has
 *     elapsed since then.
 * Otherwise the chunk is folded into `displayedText` with no flush — the
 * caller fires nothing this batch.
 */
export function stepMessageDisplay(prev, chunk, nowMs, debounceMs, isFinal) {
    const displayedText = prev.displayedText + chunk;
    const hasNewText = displayedText !== prev.lastFlushedText;
    const dueByTime = nowMs - prev.lastFlushMs >= debounceMs;
    const shouldFlush = isFinal || (hasNewText && dueByTime);
    if (!shouldFlush) {
        return { next: { ...prev, displayedText } };
    }
    return {
        next: {
            displayedText,
            lastFlushMs: nowMs,
            lastFlushedText: displayedText,
        },
        flush: { displayedText, isFinal },
    };
}
//# sourceMappingURL=message-display-buffer.js.map