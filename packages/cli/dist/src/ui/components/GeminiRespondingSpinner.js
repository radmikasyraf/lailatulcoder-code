import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import Spinner from 'ink-spinner';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { SCREEN_READER_LOADING, SCREEN_READER_RESPONDING, } from '../textConstants.js';
import { theme } from '../semantic-colors.js';
import { isClassicWindowsConsole } from '../../utils/osc.js';
const SLOW_SPINNER_INTERVAL_MS = 750;
const SLOW_SPINNER_FRAMES = ['. ', '..'];
export const GeminiRespondingSpinner = ({ nonRespondingDisplay, spinnerType = 'dots' }) => {
    const streamingState = useStreamingContext();
    const isScreenReaderEnabled = useIsScreenReaderEnabled();
    if (streamingState === StreamingState.Responding) {
        return (_jsx(GeminiSpinner, { spinnerType: spinnerType, altText: SCREEN_READER_RESPONDING }));
    }
    else if (nonRespondingDisplay) {
        return isScreenReaderEnabled ? (_jsx(Text, { children: SCREEN_READER_LOADING })) : (_jsx(Text, { color: theme.text.primary, children: nonRespondingDisplay }));
    }
    return null;
};
export const GeminiSpinner = ({ spinnerType = 'dots', altText, }) => {
    const isScreenReaderEnabled = useIsScreenReaderEnabled();
    const isTmux = Boolean(process.env['TMUX']);
    // Classic Windows console (cmd.exe/powershell.exe window, i.e. conhost.exe
    // rather than the separate Windows Terminal app): ink-spinner's ~80ms
    // "dots" animation forces a full erase+redraw every frame, which reads as
    // constant flicker on conhost's slower repaint path -- the same class of
    // problem the isTmux branch below already works around for tmux. Detected
    // the same way useTerminalProgress does: WT_SESSION/ConEmuPID present means
    // a modern terminal (Windows Terminal, ConEmu), so its absence on win32
    // means classic conhost.
    const useSlowSpinner = isTmux || isClassicWindowsConsole();
    const [slowFrameIndex, setSlowFrameIndex] = useState(0);
    useEffect(() => {
        if (isScreenReaderEnabled || !useSlowSpinner) {
            return;
        }
        const interval = setInterval(() => {
            setSlowFrameIndex((index) => (index + 1) % SLOW_SPINNER_FRAMES.length);
        }, SLOW_SPINNER_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isScreenReaderEnabled, useSlowSpinner]);
    if (isScreenReaderEnabled) {
        return _jsx(Text, { children: altText });
    }
    if (useSlowSpinner) {
        // Note: must NOT wrap in <Box> here — GeminiSpinner is rendered inside a
        // <Text> in Footer.tsx (`<Text>...<GeminiSpinner /> {msg}</Text>`), and
        // Ink forbids <Box> nested inside <Text>. The 2-char fixed-width frames
        // already give us stable layout without an explicit width container.
        return (_jsx(Text, { color: theme.text.primary, children: SLOW_SPINNER_FRAMES[slowFrameIndex] }));
    }
    return (_jsx(Text, { color: theme.text.primary, children: _jsx(Spinner, { type: spinnerType }) }));
};
//# sourceMappingURL=GeminiRespondingSpinner.js.map