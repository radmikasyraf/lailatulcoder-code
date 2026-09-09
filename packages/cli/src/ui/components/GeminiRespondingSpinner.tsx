/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import Spinner from 'ink-spinner';
import type { SpinnerName } from 'cli-spinners';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import {
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from '../textConstants.js';
import { theme } from '../semantic-colors.js';
import { isClassicWindowsConsole } from '../../utils/osc.js';

const SLOW_SPINNER_INTERVAL_MS = 750;
const SLOW_SPINNER_FRAMES = ['. ', '..'];

interface GeminiRespondingSpinnerProps {
  /**
   * Optional string to display when not in Responding state.
   * If not provided and not Responding, renders null.
   */
  nonRespondingDisplay?: string;
  spinnerType?: SpinnerName;
}

export const GeminiRespondingSpinner: React.FC<
  GeminiRespondingSpinnerProps
> = ({ nonRespondingDisplay, spinnerType = 'dots' }) => {
  const streamingState = useStreamingContext();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  if (streamingState === StreamingState.Responding) {
    return (
      <GeminiSpinner
        spinnerType={spinnerType}
        altText={SCREEN_READER_RESPONDING}
      />
    );
  } else if (nonRespondingDisplay) {
    return isScreenReaderEnabled ? (
      <Text>{SCREEN_READER_LOADING}</Text>
    ) : (
      <Text color={theme.text.primary}>{nonRespondingDisplay}</Text>
    );
  }
  return null;
};

interface GeminiSpinnerProps {
  spinnerType?: SpinnerName;
  altText?: string;
}

export const GeminiSpinner: React.FC<GeminiSpinnerProps> = ({
  spinnerType = 'dots',
  altText,
}) => {
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
    return <Text>{altText}</Text>;
  }

  if (useSlowSpinner) {
    // Note: must NOT wrap in <Box> here — GeminiSpinner is rendered inside a
    // <Text> in Footer.tsx (`<Text>...<GeminiSpinner /> {msg}</Text>`), and
    // Ink forbids <Box> nested inside <Text>. The 2-char fixed-width frames
    // already give us stable layout without an explicit width container.
    return (
      <Text color={theme.text.primary}>
        {SLOW_SPINNER_FRAMES[slowFrameIndex]}
      </Text>
    );
  }

  return (
    <Text color={theme.text.primary}>
      <Spinner type={spinnerType} />
    </Text>
  );
};
