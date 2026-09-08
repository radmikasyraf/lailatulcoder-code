/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * `qwen sessions ps` — list the interactive LailatulCoder Ai sessions running
 * right now.
 *
 * The sibling `qwen sessions list` walks saved transcripts; this walks the
 * live-process registry, so the two answer different questions: "what have
 * I worked on" versus "what is running on this machine at this moment".
 *
 * "Interactive" is a registration fact, not a filter: only the
 * interactive UI registers sessions, so headless runs (`qwen -p`) never
 * appear here.
 */
import type { CommandModule } from 'yargs';
/** Fixed column widths for the human-readable table (exported for tests). */
export declare const NAME_COL = 22;
export declare const PID_COL = 9;
export declare const AGE_COL = 10;
interface PsArgs {
    json?: boolean;
}
/**
 * Render an age as a short, human-scannable string.
 *
 * A negative delta means the record's clock ran ahead of ours (a paused
 * VM, a corrected clock). Showing "-3m" reads as a bug, so clamp to 0.
 */
export declare function formatAge(ms: number): string;
export declare const psCommand: CommandModule<unknown, PsArgs>;
export {};
