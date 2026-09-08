/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
interface FetchDiffArgs {
    prNumber: number;
    repo: string;
    out: string;
    /** The `--host` flag, fed to platform detection (an Aone host selects a1). */
    host?: string;
}
export interface FetchDiffResult {
    diffPath: string;
    lines: number;
    chars: number;
}
export declare function runFetchDiff(args: FetchDiffArgs): FetchDiffResult;
export declare const fetchDiffCommand: CommandModule;
export {};
