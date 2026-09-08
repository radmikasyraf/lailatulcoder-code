/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResultDisplay } from '../tools/tools.js';
export declare const MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS = 32000;
export declare const MAX_RETAINED_AGENT_FIELD_CHARS = 8000;
export declare const MAX_RETAINED_FILE_DIFF_CHARS = 50000;
export declare const MAX_RETAINED_FILE_CONTENT_CHARS = 16000;
export declare const MAX_RETAINED_ANSI_OUTPUT_LINES = 200;
export declare function compactStringForHistory(value: string, limit?: number): string;
export declare function compactStringForRecording(value: string, limit?: number): string;
export declare function compactToolResultDisplayForHistory<T extends ToolResultDisplay | undefined>(resultDisplay: T): T;
export declare function compactToolResultDisplayForRecording<T extends ToolResultDisplay | undefined>(resultDisplay: T): T;
