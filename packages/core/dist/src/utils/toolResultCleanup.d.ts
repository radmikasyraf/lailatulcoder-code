/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface CleanupResult {
    filesDeleted: number;
    bytesFreed: number;
    errors: number;
}
export declare function cleanupOldToolResults(globalTempDir: string, maxAgeMs: number): Promise<CleanupResult>;
