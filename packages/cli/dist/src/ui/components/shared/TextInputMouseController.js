/**
 * @license
 * Copyright 2025 LailatulCoder
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback } from 'react';
import {} from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useMouseEvents } from '../../hooks/useMouseEvents.js';
import {} from '../../utils/mouse.js';
import { measureElementPosition, layoutRowForEvent, } from '../../utils/measure-element-position.js';
import { visualClickToOffset, } from '../../utils/input-mouse.js';
import { readClipboardText } from '../../utils/clipboardUtils.js';
/**
 * Headless mouse layer for the prompt input: a left-click positions the text
 * cursor under the pointer, and a right-click pastes clipboard text at the
 * pointer's position (mirroring the terminal's native right-click-paste
 * convention, but without requiring the Shift modifier that native handlers
 * usually reserve to fall through to the terminal's own context menu).
 * Rendered only while mouse input is enabled, so its provider dependencies
 * (KeypressProvider, via useMouseEvents) are only required then.
 *
 * `left-press` and `right-press` are handled — the input has no hover
 * behavior — so this subscribes at the cheaper `'button'` tracking level (no
 * bare-motion stream).
 *
 * Coordinates are taken relative to the measured lines container, so the input
 * border row and the prefix column are accounted for automatically. Like the
 * other mouse layers this assumes alternate-screen coordinates; the owning
 * component only mounts it in that mode.
 */
export function TextInputMouseController({ linesRef, buffer, visibleLineCount, }) {
    const { rows: terminalHeight } = useTerminalSize();
    const handleMouse = useCallback((event) => {
        if (event.name !== 'left-press' && event.name !== 'right-press')
            return;
        const lines = linesRef.current;
        if (!lines)
            return;
        const rect = measureElementPosition(lines);
        if (rect.height <= 0)
            return;
        const clickVisualRow = layoutRowForEvent(lines, event.row, terminalHeight) - rect.y;
        if (clickVisualRow < 0 || clickVisualRow >= visibleLineCount)
            return;
        const clickVisualCol = Math.max(0, event.col - 1 - rect.x);
        const absoluteVisualRow = buffer.visualScrollRow + clickVisualRow;
        const offset = visualClickToOffset(buffer, absoluteVisualRow, clickVisualCol);
        if (offset === null)
            return;
        buffer.moveToOffset(offset);
        if (event.name === 'right-press') {
            readClipboardText().then((text) => {
                if (text)
                    buffer.insert(text, { paste: true });
            }, () => {
                /* best-effort: ignore clipboard read failures */
            });
        }
    }, [linesRef, buffer, visibleLineCount, terminalHeight]);
    useMouseEvents(handleMouse, { isActive: true, tracking: 'button' });
    return null;
}
//# sourceMappingURL=TextInputMouseController.js.map