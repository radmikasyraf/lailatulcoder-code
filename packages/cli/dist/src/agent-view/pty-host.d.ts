/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { AgentViewLaunchFile } from './protocol.js';
export declare const DEFAULT_AGENT_VIEW_PTY_OUTPUT_BYTES: number;
export interface AgentViewPtySpawnOptions {
    cwd: string;
    name: string;
    cols: number;
    rows: number;
    env: Record<string, string>;
    handleFlowControl: boolean;
}
export interface AgentViewPtyDisposable {
    dispose(): void;
}
export interface AgentViewPtyProcess {
    readonly pid: number;
    write(data: string): void;
    onData(callback: (data: string) => void): AgentViewPtyDisposable | void;
    onExit(callback: (event: {
        exitCode: number;
        signal?: number;
    }) => void): AgentViewPtyDisposable | void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    pause?(): void;
    resume?(): void;
}
export interface AgentViewPtyModule {
    spawn(file: string, args: readonly string[] | string, options: AgentViewPtySpawnOptions): AgentViewPtyProcess;
}
export interface AgentViewPtyImplementation {
    module: AgentViewPtyModule;
    name: 'lydell-node-pty' | 'node-pty' | 'injected';
}
export type AgentViewPtyAvailability = {
    available: true;
    implementationName: AgentViewPtyImplementation['name'];
} | {
    available: false;
    reason: 'missing';
};
export type AgentViewLaunchValidationResult = {
    ok: true;
    launch: AgentViewLaunchFile;
} | {
    ok: false;
    errors: string[];
};
export interface AgentViewPtyHostOptions {
    fakeCommand?: readonly string[];
    maxOutputBytes?: number;
    pty?: AgentViewPtyImplementation | null;
    loadPty?: () => Promise<AgentViewPtyImplementation | null>;
}
export interface AgentViewPtyHostExit {
    exitCode: number;
    signal?: number;
}
export interface AgentViewPtyHostHandle {
    pid: number;
    workerPid: number;
    command: readonly string[];
    endpoint?: string;
    authToken?: string;
    output: BoundedOutputRing;
    exited: Promise<AgentViewPtyHostExit>;
    getOutput?(): Promise<string>;
    write(data: Buffer): void;
    resetInput?(): void;
    onData(callback: (data: string) => void): AgentViewPtyDisposable | void;
    resize(size: {
        columns: number;
        rows: number;
    }): void;
    kill(signal?: string): void;
    pause?(): void;
    resume?(): void;
    shutdown?(): void | Promise<void>;
    dispose(): void;
}
export declare class AgentViewPtyUnavailableError extends Error {
    constructor();
}
export declare class AgentViewLaunchConfigError extends Error {
    readonly errors: readonly string[];
    constructor(errors: readonly string[]);
}
export declare class BoundedOutputRing {
    readonly maxBytes: number;
    private static readonly MAX_CHUNK_BYTES;
    private chunks;
    private retainedBytesValue;
    private totalBytesValue;
    constructor(maxBytes?: number);
    get retainedBytes(): number;
    get totalBytes(): number;
    get droppedBytes(): number;
    append(data: string | Buffer): void;
    toBuffer(): Buffer;
    toString(encoding?: BufferEncoding): string;
    private trim;
    private appendChunk;
    private trimLeadingUtf8ContinuationBytes;
}
export declare function checkAgentViewPtyAvailability(loadPty?: () => Promise<AgentViewPtyImplementation | null>): Promise<AgentViewPtyAvailability>;
export declare function loadAgentViewPty(): Promise<AgentViewPtyImplementation | null>;
export declare function validateAgentViewLaunchConfig(value: unknown): AgentViewLaunchValidationResult;
export declare function launchAgentViewPtyHost(rawLaunch: unknown, options?: AgentViewPtyHostOptions): Promise<AgentViewPtyHostHandle>;
