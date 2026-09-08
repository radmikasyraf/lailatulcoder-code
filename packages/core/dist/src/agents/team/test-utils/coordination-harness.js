/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview TeamCoordinationHarness — top-level test helper
 * that wires a real TeamManager with a FakeBackend.
 *
 * Provides convenience methods for spawning scripted agents,
 * waiting for messages/statuses, and clean teardown.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {} from './fake-agent.js';
import { FakeBackend } from './fake-backend.js';
import { TeamManager } from '../TeamManager.js';
import { formatAgentId, sanitizeName } from '../teamHelpers.js';
/**
 * TeamCoordinationHarness — wires real TeamManager + FakeBackend
 * for deterministic integration testing.
 */
export class TeamCoordinationHarness {
    teamManager;
    backend;
    teamName;
    /**
     * Temp dir used as the global qwen dir for this harness.
     * Team files, task files, and mailboxes live under here.
     */
    tmpDir;
    constructor(teamManager, backend, teamName, tmpDir) {
        this.teamManager = teamManager;
        this.backend = backend;
        this.teamName = teamName;
        this.tmpDir = tmpDir;
    }
    /**
     * Create a new harness with a fresh temp directory, backend,
     * team file, and TeamManager.
     */
    static async create(options) {
        const teamName = options?.teamName ?? 'test-team';
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'team-harness-'));
        // Create team directory structure.
        const teamDir = path.join(tmpDir, 'teams', teamName);
        const tasksDir = path.join(tmpDir, 'tasks', teamName);
        const inboxesDir = path.join(teamDir, 'inboxes');
        await fs.mkdir(teamDir, { recursive: true });
        await fs.mkdir(tasksDir, { recursive: true });
        await fs.mkdir(inboxesDir, { recursive: true });
        const teamFile = {
            name: teamName,
            createdAt: Date.now(),
            leadAgentId: formatAgentId('leader', teamName),
            members: [],
        };
        // Write initial team file.
        await fs.writeFile(path.join(teamDir, 'config.json'), JSON.stringify(teamFile, null, 2) + '\n', 'utf-8');
        const backend = new FakeBackend();
        await backend.init();
        const manager = new TeamManager(backend, teamFile);
        return new TeamCoordinationHarness(manager, backend, teamName, tmpDir);
    }
    // ─── Agent management ─────────────────────────────────
    /**
     * Spawn a teammate with an optional script.
     * Returns after the agent is spawned and the event bridge
     * is wired.
     */
    async spawnTeammate(name, script) {
        const sanitized = sanitizeName(name);
        const agentId = formatAgentId(sanitized, this.teamName);
        // Pre-register the script so FakeBackend uses it.
        if (script) {
            this.backend.setScript(agentId, script);
        }
        await this.teamManager.spawnTeammate({
            name,
            cwd: this.tmpDir,
        });
        const agent = this.backend.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent "${name}" (${agentId}) not found after spawn.`);
        }
        return agent;
    }
    /**
     * Get a FakeAgent by teammate name.
     */
    getAgent(name) {
        const sanitized = sanitizeName(name);
        const agentId = formatAgentId(sanitized, this.teamName);
        const agent = this.backend.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent "${name}" not found.`);
        }
        return agent;
    }
    // ─── Assertions / waiters ─────────────────────────────
    /**
     * Wait until agent has received at least n messages.
     */
    async waitForMessages(name, n) {
        const agent = this.getAgent(name);
        await agent.waitForMessageCount(n);
    }
    /**
     * Wait until agent reaches the given status.
     * Rejects after timeoutMs (default 5000).
     */
    async waitForStatus(name, status, timeoutMs = 5000) {
        const agent = this.getAgent(name);
        if (agent.getStatus() === status)
            return;
        await Promise.race([
            agent.waitForStatus(status),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Timeout waiting for "${name}" to reach ` +
                    `${status} (current: ${agent.getStatus()})`)), timeoutMs);
            }),
        ]);
    }
    // ─── Cleanup ──────────────────────────────────────────
    async cleanup() {
        await this.teamManager.cleanup();
        await fs.rm(this.tmpDir, {
            recursive: true,
            force: true,
        });
    }
}
//# sourceMappingURL=coordination-harness.js.map