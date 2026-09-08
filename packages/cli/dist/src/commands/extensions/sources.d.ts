/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
export declare function handleSourcesAdd(args: {
    source: string;
}): Promise<void>;
export declare function handleSourcesRemove(args: {
    name: string;
}): Promise<void>;
export declare function handleSourcesList(): Promise<void>;
export declare function handleSourcesUpdate(args: {
    name: string;
}): Promise<void>;
export declare const sourcesCommand: CommandModule;
