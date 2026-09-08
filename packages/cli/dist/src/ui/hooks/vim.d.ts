/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Key } from './useKeypress.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
export type VimMode = 'NORMAL' | 'INSERT';
export declare function useVim(buffer: TextBuffer, onSubmit?: (value: string) => void): {
    mode: VimMode;
    vimModeEnabled: boolean;
    handleInput: (key: Key) => boolean;
};
