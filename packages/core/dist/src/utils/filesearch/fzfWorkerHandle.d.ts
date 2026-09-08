/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type FzfResultItem } from 'fzf';
export type FzfFuzzyMode = 'v1' | 'v2' | false;
export interface FzfWorkerOptions {
    fuzzy: FzfFuzzyMode;
}
/** For tests: force the worker path even on tiny inputs. Returns a restorer. */
export declare function __setWorkerThresholdForTests(n: number): () => void;
/** For tests: clear the cached worker-path lookup. */
export declare function __resetWorkerScriptResolutionForTests(): void;
/**
 * Test/sandbox helper: route all FzfWorkerHandle.create() calls through the
 * in-thread fallback regardless of file count. Returns a restorer function
 * the caller MUST run in afterAll/afterEach to avoid leaking the override
 * into other test files (the very pitfall the parent PR's test-setup.ts
 * tripped on — see wenshao 04-21 review on PR #3455).
 */
export declare function installInProcessFzfTransport(): () => void;
export declare class FzfWorkerHandle {
    private readonly inst;
    private constructor();
    static create(files: string[], options: FzfWorkerOptions): Promise<FzfWorkerHandle>;
    find(pattern: string, limit?: number): Promise<Array<FzfResultItem<string>>>;
    dispose(): Promise<void>;
}
