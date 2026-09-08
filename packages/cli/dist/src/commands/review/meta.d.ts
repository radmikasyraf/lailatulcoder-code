/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
interface MetaArgs {
    prNumber?: number;
    repo?: string;
    host?: string;
}
export interface MetaResult {
    platform: string;
    host: string;
    ownerRepo: string;
    number?: number;
    headSha?: string;
    webUrl?: string;
}
export declare function runMeta(args: MetaArgs): MetaResult;
export declare const metaCommand: CommandModule;
export {};
