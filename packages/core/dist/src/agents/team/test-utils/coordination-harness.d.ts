/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FakeAgent } from './fake-agent.js';
import { type FakeAgentScript } from './fake-agent.js';
import { FakeBackend } from './fake-backend.js';
import { TeamManager } from '../TeamManager.js';
import type { AgentStatus } from '../../runtime/agent-types.js';
/**
 * Options for creating a harness.
 */
export interface HarnessOptions {
    teamName?: string;
    maxTeammates?: number;
}
/**
 * TeamCoordinationHarness — wires real TeamManager + FakeBackend
 * for deterministic integration testing.
 */
export declare class TeamCoordinationHarness {
    readonly teamManager: TeamManager;
    readonly backend: FakeBackend;
    readonly teamName: string;
    /**
     * Temp dir used as the global qwen dir for this harness.
     * Team files, task files, and mailboxes live under here.
     */
    readonly tmpDir: string;
    private constructor();
    /**
     * Create a new harness with a fresh temp directory, backend,
     * team file, and TeamManager.
     */
    static create(options?: HarnessOptions): Promise<TeamCoordinationHarness>;
    /**
     * Spawn a teammate with an optional script.
     * Returns after the agent is spawned and the event bridge
     * is wired.
     */
    spawnTeammate(name: string, script?: FakeAgentScript): Promise<FakeAgent>;
    /**
     * Get a FakeAgent by teammate name.
     */
    getAgent(name: string): FakeAgent;
    /**
     * Wait until agent has received at least n messages.
     */
    waitForMessages(name: string, n: number): Promise<void>;
    /**
     * Wait until agent reaches the given status.
     * Rejects after timeoutMs (default 5000).
     */
    waitForStatus(name: string, status: AgentStatus, timeoutMs?: number): Promise<void>;
    cleanup(): Promise<void>;
}
