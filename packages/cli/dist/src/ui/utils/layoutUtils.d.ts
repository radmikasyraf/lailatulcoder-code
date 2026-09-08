/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Shared layout calculation utilities for the terminal UI.
 */
/**
 * Calculate the widths for the input prompt area based on terminal width.
 *
 * Returns the content width (for the text buffer), the total container width
 * (including border + padding + prefix), the suggestions dropdown width,
 * and the frame overhead constant.
 */
export declare const calculatePromptWidths: (terminalWidth: number) => {
    readonly inputWidth: number;
    readonly containerWidth: number;
    readonly suggestionsWidth: number;
    readonly frameOverhead: number;
};
export declare const MAIN_CONTENT_HEIGHT_RESERVATION = 2;
export declare const clampDialogHeight: (height: number | undefined) => number | undefined;
/**
 * Returns the max row budget for dialogs rendered in the input/control area.
 *
 * The row reservation matches AppContainer's main-content height
 * reservation. Keeping the same buffer here prevents a newly opened dialog from
 * painting into the terminal's bottom rows before control-height measurement
 * settles.
 */
export declare const getDialogMaxHeight: (terminalHeight: number, staticExtraHeight: number) => number;
