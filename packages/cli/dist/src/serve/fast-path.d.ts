/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { RunHandle } from './run-qwen-serve.js';
import type { ServeFastPathSettings } from './fast-path-settings.js';
import type { ServeOptions } from './types.js';
interface ParsedServeFastPath {
    kind: 'serve';
    open: boolean;
    httpBridge: boolean;
    options: ServeOptions;
}
interface FallbackFastPath {
    kind: 'fallback';
}
export type ServeFastPathParseResult = ParsedServeFastPath | FallbackFastPath;
export declare function waitForServeRuntimeOrExit(handle: Pick<RunHandle, 'runtimeReady' | 'close'>): Promise<void>;
export declare function bootstrapServeFastPathEnvironment(workspace: string | undefined): Promise<ServeFastPathSettings | undefined>;
export declare function parseServeFastPathArgs(rawArgv: readonly string[], env?: NodeJS.ProcessEnv): ServeFastPathParseResult;
export declare function tryRunServeFastPath(rawArgv?: readonly string[]): Promise<boolean>;
export {};
