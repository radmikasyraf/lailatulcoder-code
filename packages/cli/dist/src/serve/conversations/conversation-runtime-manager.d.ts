/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ConversationWorkspace } from './conversation-workspace.js';
import type { ConversationRuntimeOwnership } from './conversation-runtime-ownership.js';
import type { WorkspaceRegistry, WorkspaceRuntime } from '../workspace-registry.js';
export interface ConversationRuntimeManagerOptions {
    ownership: ConversationRuntimeOwnership;
    workspace: Pick<ConversationWorkspace, 'revalidate' | 'assertExactRoot'>;
    registry: WorkspaceRegistry;
    publishRuntime: (canonicalRoot: string, validate: (runtime: WorkspaceRuntime) => void | Promise<void>) => Promise<WorkspaceRuntime>;
}
export declare class ConversationRuntimeManager {
    private readonly options;
    private runtime?;
    private pending?;
    constructor(options: ConversationRuntimeManagerOptions);
    ensure(): Promise<WorkspaceRuntime>;
    private ensureOnce;
    private revalidateRoot;
    private assertExactRoot;
    private assertActiveRuntime;
    private assertOwnedRuntime;
}
