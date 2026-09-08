/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
/** Fixed column widths for the human-readable table (exported for tests). */
export declare const SESSION_COL = 38;
export declare const TIME_COL = 16;
export declare const TITLE_COL = 24;
export declare const BRANCH_COL = 12;
export interface ListArgs {
    json?: boolean;
    limit?: number;
}
export declare function handleList(argv: ListArgs): Promise<void>;
export declare const listCommand: CommandModule<unknown, ListArgs>;
