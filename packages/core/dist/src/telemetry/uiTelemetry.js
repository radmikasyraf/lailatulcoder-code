/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'node:events';
import { EVENT_API_ERROR, EVENT_API_RESPONSE, EVENT_TOOL_CALL, } from './constants.js';
import { ToolCallDecision } from './tool-call-decision.js';
import { MAIN_SOURCE } from '../utils/subagentNameContext.js';
import { isInternalPromptId } from '../utils/internalPromptIds.js';
export { MAIN_SOURCE } from '../utils/subagentNameContext.js';
export { EVENT_API_ERROR, EVENT_API_RESPONSE, EVENT_TOOL_CALL, } from './constants.js';
const createInitialModelMetricsCore = () => ({
    api: {
        totalRequests: 0,
        totalErrors: 0,
        totalLatencyMs: 0,
    },
    tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
    },
});
// `bySource` keys are user-controlled subagent names. Using a prototype-free
// map avoids crashes when a subagent is named after an inherited Object
// member (e.g. `constructor`, `toString`, `hasOwnProperty`), which would
// otherwise short-circuit `!bySource[name]` checks and return the inherited
// prototype member as the "bucket".
const createInitialModelMetrics = () => ({
    ...createInitialModelMetricsCore(),
    bySource: Object.create(null),
});
const createInitialSkillMetrics = () => ({
    totalCalls: 0,
    totalSuccess: 0,
    totalFail: 0,
    byName: {},
});
const createInitialGenerationMetrics = () => ({
    timedRequests: 0,
    totalTtftMs: 0,
    totalGenerationDurationMs: 0,
    totalThroughputOutputTokens: 0,
});
const createInitialMetrics = () => ({
    models: {},
    tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
        byName: {},
    },
    files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
    },
    skills: createInitialSkillMetrics(),
});
export class UiTelemetryService extends EventEmitter {
    static #MAX_CLOSED_SESSIONS = 1000;
    #metrics = createInitialMetrics();
    #sessionMetrics = new Map();
    #closedSessions = new Set();
    #lastPromptTokenCount = 0;
    #lastCachedContentTokenCount = 0;
    #sessionStartTime = new Date();
    addEvent(event, sessionId) {
        if (!this.#accumulateEvent(this.#metrics, event))
            return;
        if (sessionId && !this.#closedSessions.has(sessionId)) {
            if (!this.#sessionMetrics.has(sessionId)) {
                this.#sessionMetrics.set(sessionId, createInitialMetrics());
            }
            this.#accumulateEvent(this.#sessionMetrics.get(sessionId), event);
        }
        this.emit('update', {
            metrics: this.#metrics,
            lastPromptTokenCount: this.#lastPromptTokenCount,
        });
    }
    getMetrics() {
        return this.#metrics;
    }
    getMetricsForSession(sessionId) {
        return this.#sessionMetrics.get(sessionId) ?? createInitialMetrics();
    }
    recordSkillInvocation(skillName, success, sessionId) {
        this.#accumulateSkillInvocation(this.#metrics, skillName, success);
        if (sessionId && !this.#closedSessions.has(sessionId)) {
            if (!this.#sessionMetrics.has(sessionId)) {
                this.#sessionMetrics.set(sessionId, createInitialMetrics());
            }
            this.#accumulateSkillInvocation(this.#sessionMetrics.get(sessionId), skillName, success);
        }
        this.emit('update', {
            metrics: this.#metrics,
            lastPromptTokenCount: this.#lastPromptTokenCount,
        });
    }
    getLastPromptTokenCount() {
        return this.#lastPromptTokenCount;
    }
    setLastPromptTokenCount(lastPromptTokenCount) {
        this.#lastPromptTokenCount = lastPromptTokenCount;
        this.emit('update', {
            metrics: this.#metrics,
            lastPromptTokenCount: this.#lastPromptTokenCount,
        });
    }
    getSessionStartTime() {
        return this.#sessionStartTime;
    }
    getLastCachedContentTokenCount() {
        return this.#lastCachedContentTokenCount;
    }
    setLastCachedContentTokenCount(count) {
        this.#lastCachedContentTokenCount = count;
    }
    /**
     * Resets metrics to the initial state (used when resuming a session).
     */
    reset() {
        this.#metrics = createInitialMetrics();
        this.#sessionMetrics.clear();
        this.#closedSessions.clear();
        this.#lastPromptTokenCount = 0;
        this.#lastCachedContentTokenCount = 0;
        this.#sessionStartTime = new Date();
        this.emit('update', {
            metrics: this.#metrics,
            lastPromptTokenCount: this.#lastPromptTokenCount,
        });
    }
    resetSession(sessionId) {
        this.#sessionMetrics.set(sessionId, createInitialMetrics());
        this.#closedSessions.delete(sessionId);
    }
    removeSession(sessionId) {
        this.#sessionMetrics.delete(sessionId);
        this.#closedSessions.add(sessionId);
        if (this.#closedSessions.size > UiTelemetryService.#MAX_CLOSED_SESSIONS) {
            const oldest = this.#closedSessions.values().next().value;
            if (oldest)
                this.#closedSessions.delete(oldest);
        }
    }
    #accumulateEvent(metrics, event) {
        switch (event['event.name']) {
            case EVENT_API_RESPONSE:
                this.#accumulateApiResponse(metrics, event);
                return true;
            case EVENT_API_ERROR:
                this.#accumulateApiError(metrics, event);
                return true;
            case EVENT_TOOL_CALL:
                this.#accumulateToolCall(metrics, event);
                return true;
            default:
                return false;
        }
    }
    #accumulateApiResponse(metrics, event) {
        const modelMetrics = this.#getOrCreateModelMetrics(metrics, event.model);
        const sourceMetrics = this.#getOrCreateSourceMetrics(modelMetrics, event.subagent_name ?? MAIN_SOURCE);
        for (const bucket of [modelMetrics, sourceMetrics]) {
            bucket.api.totalRequests++;
            bucket.api.totalLatencyMs += event.duration_ms;
            bucket.tokens.prompt += event.input_token_count;
            bucket.tokens.candidates += event.output_token_count;
            bucket.tokens.total += event.total_token_count;
            bucket.tokens.cached += event.cached_content_token_count;
            bucket.tokens.thoughts += event.thoughts_token_count;
        }
        if (event.ttft_ms === undefined ||
            !Number.isFinite(event.ttft_ms) ||
            event.ttft_ms < 0 ||
            isInternalPromptId(event.prompt_id)) {
            return;
        }
        const generation = metrics.generation ??
            (metrics.generation = createInitialGenerationMetrics());
        const generationDurationMs = Math.max(0, event.duration_ms - event.ttft_ms);
        generation.timedRequests++;
        generation.totalTtftMs += event.ttft_ms;
        if (generationDurationMs > 0) {
            generation.totalGenerationDurationMs += generationDurationMs;
            generation.totalThroughputOutputTokens += event.output_token_count;
        }
        generation.last = {
            model: event.model,
            ttftMs: event.ttft_ms,
            generationDurationMs,
            outputTokens: event.output_token_count,
        };
    }
    #accumulateApiError(metrics, event) {
        const modelMetrics = this.#getOrCreateModelMetrics(metrics, event.model);
        const sourceMetrics = this.#getOrCreateSourceMetrics(modelMetrics, event.subagent_name ?? MAIN_SOURCE);
        for (const bucket of [modelMetrics, sourceMetrics]) {
            bucket.api.totalRequests++;
            bucket.api.totalErrors++;
            bucket.api.totalLatencyMs += event.duration_ms;
        }
    }
    #accumulateToolCall(metrics, event) {
        const { tools, files } = metrics;
        tools.totalCalls++;
        tools.totalDurationMs += event.duration_ms;
        if (event.success) {
            tools.totalSuccess++;
        }
        else {
            tools.totalFail++;
        }
        if (!tools.byName[event.function_name]) {
            tools.byName[event.function_name] = {
                count: 0,
                success: 0,
                fail: 0,
                durationMs: 0,
                decisions: {
                    [ToolCallDecision.ACCEPT]: 0,
                    [ToolCallDecision.REJECT]: 0,
                    [ToolCallDecision.MODIFY]: 0,
                    [ToolCallDecision.AUTO_ACCEPT]: 0,
                },
            };
        }
        const toolStats = tools.byName[event.function_name];
        toolStats.count++;
        toolStats.durationMs += event.duration_ms;
        if (event.success) {
            toolStats.success++;
        }
        else {
            toolStats.fail++;
        }
        if (event.decision) {
            tools.totalDecisions[event.decision]++;
            toolStats.decisions[event.decision]++;
        }
        if (event.metadata) {
            if (event.metadata['model_added_lines'] !== undefined) {
                files.totalLinesAdded += event.metadata['model_added_lines'];
            }
            if (event.metadata['model_removed_lines'] !== undefined) {
                files.totalLinesRemoved += event.metadata['model_removed_lines'];
            }
        }
    }
    #accumulateSkillInvocation(metrics, skillName, success) {
        const skills = metrics.skills ?? createInitialSkillMetrics();
        metrics.skills = skills;
        skills.totalCalls++;
        if (success) {
            skills.totalSuccess++;
        }
        else {
            skills.totalFail++;
        }
        if (!Object.prototype.hasOwnProperty.call(skills.byName, skillName)) {
            Object.defineProperty(skills.byName, skillName, {
                value: {
                    count: 0,
                    success: 0,
                    fail: 0,
                },
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        const skillStats = skills.byName[skillName];
        if (!skillStats) {
            return;
        }
        skillStats.count++;
        if (success) {
            skillStats.success++;
        }
        else {
            skillStats.fail++;
        }
    }
    #getOrCreateModelMetrics(metrics, modelName) {
        if (!metrics.models[modelName]) {
            metrics.models[modelName] = createInitialModelMetrics();
        }
        return metrics.models[modelName];
    }
    #getOrCreateSourceMetrics(modelMetrics, source) {
        if (!modelMetrics.bySource[source]) {
            modelMetrics.bySource[source] = createInitialModelMetricsCore();
        }
        return modelMetrics.bySource[source];
    }
}
export const uiTelemetryService = new UiTelemetryService();
//# sourceMappingURL=uiTelemetry.js.map