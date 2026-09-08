/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Parse a `terminalSequence` string into individual validated tokens.
 *
 * Returns the array of raw sequence strings when the entire input is
 * valid, or `null` when any part is invalid.
 */
export declare function parseAllowedTerminalSequences(input: string): string[] | null;
/**
 * Validate and emit a `terminalSequence` string through a raw writer.
 *
 * BEL is written raw (so tmux bell-action works).
 * OSC sequences are wrapped for tmux/screen passthrough.
 *
 * @returns `true` when the sequence was emitted, `false` when rejected.
 */
export declare function emitTerminalSequence(sequence: string, writeRaw: (data: string) => void): boolean;
