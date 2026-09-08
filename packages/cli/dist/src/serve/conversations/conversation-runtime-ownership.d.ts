/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LockOptions } from 'proper-lockfile';
export interface ConversationRuntimeOwnership {
    acquire(): Promise<{
        reclaimed: boolean;
    }>;
    release(): Promise<boolean>;
}
export interface ConversationRuntimeOwnershipOptions {
    stableBaseDir: string;
    pid: number;
    instanceNonce: string;
    isProcessAlive?: (pid: number) => boolean;
    wait?: (milliseconds: number) => Promise<void>;
    handoffGraceMs?: number;
    lockOptions?: Pick<LockOptions, 'stale' | 'update' | 'retries'>;
}
export declare function getConversationRuntimeOwnerPath(stableBaseDir: string): string;
export declare function createConversationRuntimeOwnership(options: ConversationRuntimeOwnershipOptions): ConversationRuntimeOwnership;
