/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview FakeBackend — test double for the Backend interface.
 *
 * Creates FakeAgent instances instead of real PTY subprocesses.
 * Implements the full Backend interface with no-op stubs for
 * navigation and screen capture methods.
 */
import type { AnsiOutput } from '../../../utils/terminalSerializer.js';
import { type Backend, type AgentSpawnConfig, type AgentExitCallback } from '../../backends/types.js';
import { FakeAgent, type FakeAgentScript } from './fake-agent.js';
/**
 * FakeBackend — Backend implementation that creates FakeAgent
 * instances for deterministic testing of multi-agent coordination.
 */
export declare class FakeBackend implements Backend {
    readonly type: "in-process";
    private readonly agents;
    private readonly scripts;
    private readonly spawnedConfigs;
    private exitCallback;
    /** Pre-register a script for an agent ID. */
    setScript(agentId: string, script: FakeAgentScript): void;
    init(): Promise<void>;
    spawnAgent(config: AgentSpawnConfig): Promise<void>;
    stopAgent(agentId: string): void;
    stopAll(): void;
    cleanup(): Promise<void>;
    setOnAgentExit(callback: AgentExitCallback): void;
    waitForAll(timeoutMs?: number): Promise<boolean>;
    waitForAgent(agentId: string, timeoutMs?: number): Promise<boolean>;
    switchTo(_agentId: string): void;
    switchToNext(): void;
    switchToPrevious(): void;
    getActiveAgentId(): string | null;
    getActiveSnapshot(): AnsiOutput | null;
    getAgentSnapshot(_agentId: string, _scrollOffset?: number): AnsiOutput | null;
    getAgentScrollbackLength(_agentId: string): number;
    forwardInput(_data: string): boolean;
    writeToAgent(agentId: string, data: string): boolean;
    resizeAll(_cols: number, _rows: number): void;
    getAttachHint(): string | null;
    /**
     * Get a FakeAgent by agent ID.
     * Matches InProcessBackend.getAgent() so TeamManager's event
     * bridge works unchanged.
     */
    getAgent(agentId: string): FakeAgent | undefined;
    /** Get all spawned agent IDs. */
    getAgentIds(): string[];
    /** Get the spawn config for an agent (for test assertions). */
    getSpawnConfig(agentId: string): AgentSpawnConfig | undefined;
}
