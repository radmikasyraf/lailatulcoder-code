/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { DISPLAY_MODE, } from '../../backends/types.js';
import { isTerminalStatus } from '../../runtime/agent-types.js';
import { AgentStatus } from '../../runtime/agent-types.js';
import { FakeAgent } from './fake-agent.js';
/**
 * FakeBackend — Backend implementation that creates FakeAgent
 * instances for deterministic testing of multi-agent coordination.
 */
export class FakeBackend {
    type = DISPLAY_MODE.IN_PROCESS;
    agents = new Map();
    scripts = new Map();
    spawnedConfigs = new Map();
    exitCallback = null;
    // ─── Test setup ─────────────────────────────────────────────
    /** Pre-register a script for an agent ID. */
    setScript(agentId, script) {
        this.scripts.set(agentId, script);
    }
    // ─── Backend interface ──────────────────────────────────────
    async init() {
        // Nothing to initialize.
    }
    async spawnAgent(config) {
        if (this.agents.has(config.agentId)) {
            throw new Error(`Agent "${config.agentId}" already exists.`);
        }
        this.spawnedConfigs.set(config.agentId, config);
        const script = this.scripts.get(config.agentId) ?? {};
        const name = config.inProcess?.agentName ?? config.agentId;
        const agent = new FakeAgent(config.agentId, name, script);
        this.agents.set(config.agentId, agent);
        await agent.start();
        // Watch for terminal status to fire exit callback.
        void agent.waitForCompletion().then(() => {
            const status = agent.getStatus();
            if (!isTerminalStatus(status))
                return;
            const exitCode = status === AgentStatus.COMPLETED
                ? 0
                : status === AgentStatus.FAILED
                    ? 1
                    : null;
            this.exitCallback?.(config.agentId, exitCode, null);
        });
    }
    stopAgent(agentId) {
        this.agents.get(agentId)?.abort();
    }
    stopAll() {
        for (const agent of this.agents.values()) {
            agent.abort();
        }
    }
    async cleanup() {
        this.stopAll();
        this.agents.clear();
        this.scripts.clear();
    }
    setOnAgentExit(callback) {
        this.exitCallback = callback;
    }
    async waitForAll(timeoutMs) {
        const promises = Array.from(this.agents.values()).map((a) => a.waitForCompletion());
        if (timeoutMs === undefined) {
            await Promise.allSettled(promises);
            return true;
        }
        let timerId;
        const timeout = new Promise((resolve) => {
            timerId = setTimeout(() => resolve('timeout'), timeoutMs);
        });
        const result = await Promise.race([
            Promise.allSettled(promises).then(() => 'done'),
            timeout,
        ]);
        clearTimeout(timerId);
        return result === 'done';
    }
    async waitForAgent(agentId, timeoutMs) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return false;
        const completion = agent.waitForCompletion();
        if (timeoutMs === undefined) {
            await completion;
            return true;
        }
        let timerId;
        const timeout = new Promise((resolve) => {
            timerId = setTimeout(() => resolve('timeout'), timeoutMs);
        });
        const result = await Promise.race([
            completion.then(() => 'done'),
            timeout,
        ]);
        clearTimeout(timerId);
        return result === 'done';
    }
    // ─── Navigation & screen capture: no-op stubs ──────────────
    switchTo(_agentId) { }
    switchToNext() { }
    switchToPrevious() { }
    getActiveAgentId() {
        return null;
    }
    getActiveSnapshot() {
        return null;
    }
    getAgentSnapshot(_agentId, _scrollOffset) {
        return null;
    }
    getAgentScrollbackLength(_agentId) {
        return 0;
    }
    // ─── Input ─────────────────────────────────────────────────
    forwardInput(_data) {
        return false;
    }
    writeToAgent(agentId, data) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return false;
        agent.enqueueMessage(data);
        return true;
    }
    // ─── Resize ────────────────────────────────────────────────
    resizeAll(_cols, _rows) { }
    // ─── External session ──────────────────────────────────────
    getAttachHint() {
        return null;
    }
    // ─── Extra: matches InProcessBackend.getAgent() ────────────
    /**
     * Get a FakeAgent by agent ID.
     * Matches InProcessBackend.getAgent() so TeamManager's event
     * bridge works unchanged.
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    /** Get all spawned agent IDs. */
    getAgentIds() {
        return Array.from(this.agents.keys());
    }
    /** Get the spawn config for an agent (for test assertions). */
    getSpawnConfig(agentId) {
        return this.spawnedConfigs.get(agentId);
    }
}
//# sourceMappingURL=fake-backend.js.map