/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ChildProcess } from 'node:child_process';
import type { AgentViewLaunchFile } from './protocol.js';
import { type AgentViewPtyHostHandle, type AgentViewPtyImplementation } from './pty-host.js';
export declare const INTERNAL_AGENT_VIEW_PTY_HOST_ARG = "--internal-agent-view-pty-host";
export interface AgentViewPtyHostProcessOptions {
    globalDir?: string;
    spawnProcess?: (args: readonly string[], env: Readonly<Record<string, string>>, stderrLogPath?: string) => ChildProcess;
}
export interface RunAgentViewPtyHostProcessOptions {
    launchPath: string;
    socketPath: string;
    authToken?: string;
    loadPty?: () => Promise<AgentViewPtyImplementation | null>;
}
export declare function launchAgentViewPtyHostProcess(launch: AgentViewLaunchFile, options?: AgentViewPtyHostProcessOptions): Promise<AgentViewPtyHostHandle>;
export interface AgentViewPtyHostConnectOptions {
    readyRetries?: number;
    requestTimeoutMs?: number;
}
export declare function connectAgentViewPtyHostProcess(launch: AgentViewLaunchFile, socketPath: string, authToken?: string, options?: AgentViewPtyHostConnectOptions): Promise<AgentViewPtyHostHandle>;
export declare function runAgentViewPtyHostProcess({ launchPath, socketPath, authToken, loadPty, }: RunAgentViewPtyHostProcessOptions): Promise<void>;
export declare function getAgentViewPtyHostSocketPath(sessionId: string, options?: {
    globalDir?: string;
    platform?: NodeJS.Platform;
}): string;
export declare function createAgentViewPtyHostServer(host: AgentViewPtyHostHandle, socketPath: string, options?: {
    authToken?: string;
    shutdownGraceMs?: number;
}): {
    listen(): Promise<void>;
    close(): Promise<void>;
};
