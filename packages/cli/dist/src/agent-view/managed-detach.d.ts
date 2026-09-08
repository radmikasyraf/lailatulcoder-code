/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { AgentViewSupervisorClientHandle } from './supervisor-runner.js';
interface DetachableConfig {
    getSessionId(): string;
    getProjectRoot(): string;
    getTargetDir(): string;
    getApprovalMode(): unknown;
    getSandbox(): unknown;
}
interface DetachTerminalSize {
    columns: number;
    rows: number;
}
interface DetachOptions {
    globalDir?: string;
    terminal?: Partial<DetachTerminalSize>;
    ensureSupervisor?: (options: {
        globalDir?: string;
    }) => Promise<Pick<AgentViewSupervisorClientHandle, 'adopt'>>;
}
export declare function detachCurrentSessionToAgentView(config: DetachableConfig, options?: DetachOptions): Promise<{
    sessionId: string;
}>;
export {};
