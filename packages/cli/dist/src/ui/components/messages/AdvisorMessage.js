import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
// border(1)*2 + paddingX(1)*2 = 4
const ADVISOR_SELF_CHROME = 4;
const AdvisorMessageInternal = ({ text, model, containerWidth, }) => {
    const { columns: terminalWidth } = useTerminalSize();
    const baseWidth = containerWidth ?? terminalWidth;
    const contentWidth = Math.max(2, baseWidth - ADVISOR_SELF_CHROME);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentCyan, paddingX: 1, width: "100%", children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: Colors.AccentCyan, bold: true, children: '/advisor' }), _jsx(Text, { color: Colors.AccentCyan, children: ` · ${model}` })] }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: _jsx(MarkdownDisplay, { text: text, isPending: false, contentWidth: contentWidth }) })] }));
};
export const AdvisorMessage = React.memo(AdvisorMessageInternal);
//# sourceMappingURL=AdvisorMessage.js.map