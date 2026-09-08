/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { createChildAbortController } from '../../utils/abortController.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
import { AgentEventType } from './agent-events.js';
import { AgentTerminateMode } from './agent-types.js';
import { logSubagentExecution } from '../../telemetry/loggers.js';
import { SubagentExecutionEvent } from '../../telemetry/types.js';
import { AgentCore, EXTERNAL_MESSAGE_PREFIX } from './agent-core.js';
import { DEFAULT_QWEN_MODEL } from '../../config/models.js';
const debugLogger = createDebugLogger('SUBAGENT');
// ─── Utilities (unchanged, re-exported for consumers) ────────
/**
 * Manages the runtime context state for the subagent.
 * This class provides a mechanism to store and retrieve key-value pairs
 * that represent the dynamic state and variables accessible to the subagent
 * during its execution.
 */
export class ContextState {
    state = {};
    /**
     * Retrieves a value from the context state.
     *
     * @param key - The key of the value to retrieve.
     * @returns The value associated with the key, or undefined if the key is not found.
     */
    get(key) {
        return this.state[key];
    }
    /**
     * Sets a value in the context state.
     *
     * @param key - The key to set the value under.
     * @param value - The value to set.
     */
    set(key, value) {
        this.state[key] = value;
    }
    /**
     * Retrieves all keys in the context state.
     *
     * @returns An array of all keys in the context state.
     */
    get_keys() {
        return Object.keys(this.state);
    }
}
/**
 * Replaces `${...}` placeholders in a template string with values from a context.
 *
 * This function identifies all placeholders in the format `${key}`, validates that
 * each key exists in the provided `ContextState`, and then performs the substitution.
 *
 * @param template The template string containing placeholders.
 * @param context The `ContextState` object providing placeholder values.
 * @returns The populated string with all placeholders replaced.
 * @throws {Error} if any placeholder key is not found in the context.
 */
export function templateString(template, context) {
    const placeholderRegex = /\$\{([a-zA-Z_]\w*)\}/g;
    // First, find all unique keys required by the template.
    const requiredKeys = new Set(Array.from(template.matchAll(placeholderRegex), (match) => match[1]));
    // Check if all required keys exist in the context.
    const contextKeys = new Set(context.get_keys());
    const missingKeys = Array.from(requiredKeys).filter((key) => !contextKeys.has(key));
    if (missingKeys.length > 0) {
        throw new Error(`Missing context values for the following keys: ${missingKeys.join(', ')}`);
    }
    // Perform the replacement using a replacer function.
    return template.replace(placeholderRegex, (_match, key) => String(context.get(key)));
}
// ─── AgentHeadless ──────────────────────────────────────────
/**
 * AgentHeadless — sequential task executor.
 *
 * Each execute() call runs one task through AgentCore's reasoning loop. Calls
 * must be sequential; later calls reuse the same chat and prepared tools.
 */
export class AgentHeadless {
    core;
    finalText = '';
    terminateMode = AgentTerminateMode.ERROR;
    chat;
    toolsList;
    executing = false;
    hasStartedReasoning = false;
    externalMessageProvider;
    externalMessageWaiter;
    externalMessageWaitPredicate;
    constructor(core) {
        this.core = core;
    }
    /**
     * Creates a new AgentHeadless instance.
     *
     * @param name - The name for the subagent, used for logging and identification.
     * @param runtimeContext - The shared runtime configuration and services.
     * @param promptConfig - Configuration for the subagent's prompt and behavior.
     * @param modelConfig - Configuration for the generative model parameters.
     * @param runConfig - Configuration for the subagent's execution environment.
     * @param toolConfig - Optional configuration for tools available to the subagent.
     * @param eventEmitter - Optional event emitter for streaming events to UI.
     * @param hooks - Optional lifecycle hooks.
     */
    static async create(name, runtimeContext, promptConfig, modelConfig, runConfig, toolConfig, eventEmitter, hooks, runtimeView) {
        const core = new AgentCore(name, runtimeContext, promptConfig, modelConfig, runConfig, toolConfig, eventEmitter, hooks, runtimeView);
        return new AgentHeadless(core);
    }
    /**
     * Executes the task in headless mode.
     *
     * This method orchestrates the subagent's execution lifecycle:
     * 1. Creates a chat session
     * 2. Prepares tools
     * 3. Runs the reasoning loop until completion/termination
     * 4. Emits start/finish/error events
     * 5. Records telemetry
     *
     * @param context - The current context state containing variables for prompt templating.
     * @param externalSignal - Optional abort signal for external cancellation.
     */
    async execute(context, externalSignal, options = {}) {
        if (this.executing) {
            throw new Error('AgentHeadless does not support concurrent execute() calls.');
        }
        this.executing = true;
        this.finalText = '';
        this.terminateMode = AgentTerminateMode.ERROR;
        const resetStats = options.resetStats !== false;
        if (resetStats) {
            this.core.resetExecutionStats();
        }
        try {
            await this.executeTurn(context, externalSignal, !resetStats);
        }
        finally {
            this.executing = false;
        }
    }
    async executeExternalInputs(inputs, externalSignal, options = {}) {
        if (inputs.length === 0)
            return;
        const context = new ContextState();
        context.set('external_inputs_override', inputs);
        await this.execute(context, externalSignal, options);
    }
    async executeTurn(context, externalSignal, preserveStats = false) {
        const initialMessagesOverride = context.get('initial_messages_override');
        const isContinuation = this.hasStartedReasoning;
        const externalInputsOverride = isContinuation
            ? context.get('external_inputs_override')
            : undefined;
        // Record the initial user turn in the observable message log before
        // anything that can throw — createChat / prepareTools failures still
        // get a transcript showing the task that was asked, which is what
        // the background-agent detail view reads via AgentCore.getMessages().
        // Mirrors AgentInteractive's run loop.
        const initialTaskText = String(context.get('task_prompt') ?? 'Get Started!');
        if (isContinuation) {
            const transcriptInputs = externalInputsOverride ?? [initialTaskText];
            for (const input of transcriptInputs) {
                this.core.eventEmitter.emit(AgentEventType.EXTERNAL_MESSAGE, {
                    subagentId: this.core.subagentId,
                    kind: typeof input === 'string' ? 'message' : input.kind,
                    text: typeof input === 'string' ? input : input.text,
                    timestamp: Date.now(),
                });
            }
        }
        else if (!initialMessagesOverride ||
            initialMessagesOverride.length === 0) {
            this.core.pushMessage('user', initialTaskText);
        }
        let chat = this.chat;
        if (!chat) {
            chat = await this.core.createChat(context);
            this.chat = chat;
        }
        if (!chat) {
            this.terminateMode = AgentTerminateMode.ERROR;
            return;
        }
        // Child controller propagates from optional externalSignal and auto-cleans
        // its parent listener when aborted (see utils/abortController.ts).
        const abortController = createChildAbortController(externalSignal);
        try {
            if (!this.toolsList) {
                this.toolsList = await this.core.prepareTools();
            }
            const toolsList = this.toolsList;
            const initialMessages = externalInputsOverride
                ? [
                    {
                        role: 'user',
                        parts: externalInputsOverride.map((input) => ({
                            text: typeof input === 'string'
                                ? `${EXTERNAL_MESSAGE_PREFIX} ${input}`
                                : input.text,
                        })),
                    },
                ]
                : isContinuation
                    ? [
                        {
                            role: 'user',
                            parts: [
                                { text: `${EXTERNAL_MESSAGE_PREFIX} ${initialTaskText}` },
                            ],
                        },
                    ]
                    : initialMessagesOverride && initialMessagesOverride.length > 0
                        ? initialMessagesOverride
                        : [{ role: 'user', parts: [{ text: initialTaskText }] }];
            const startTime = preserveStats && this.core.executionStats.startTimeMs > 0
                ? this.core.executionStats.startTimeMs
                : Date.now();
            const roundOffset = preserveStats ? this.core.executionStats.rounds : 0;
            if (!preserveStats || this.core.executionStats.startTimeMs === 0) {
                this.core.executionStats.startTimeMs = startTime;
                this.core.stats.start(startTime);
            }
            try {
                // Emit start event
                this.core.eventEmitter?.emit(AgentEventType.START, {
                    subagentId: this.core.subagentId,
                    name: this.core.name,
                    model: this.core.modelConfig.model ||
                        this.core.runtimeContext.getModel() ||
                        DEFAULT_QWEN_MODEL,
                    tools: (this.core.toolConfig?.tools || ['*']).map((t) => typeof t === 'string' ? t : t.name),
                    timestamp: Date.now(),
                });
                // Log telemetry for subagent start
                const startEvent = new SubagentExecutionEvent(this.core.name, 'started');
                logSubagentExecution(this.core.runtimeContext, startEvent);
                // Delegate to AgentCore's reasoning loop
                this.hasStartedReasoning = true;
                const result = await this.core.runReasoningLoop(chat, initialMessages, toolsList, abortController, {
                    maxTurns: this.core.runConfig.max_turns,
                    maxTimeMinutes: this.core.runConfig.max_time_minutes,
                    startTimeMs: startTime,
                    roundOffset,
                    getExternalMessages: this.externalMessageProvider,
                    waitForExternalMessages: this.externalMessageWaiter,
                    shouldWaitForExternalMessages: this.externalMessageWaitPredicate,
                });
                this.finalText = result.text;
                this.terminateMode = result.terminateMode ?? AgentTerminateMode.GOAL;
            }
            catch (error) {
                debugLogger.error('Error during subagent execution:', error);
                this.terminateMode = AgentTerminateMode.ERROR;
                this.core.eventEmitter?.emit(AgentEventType.ERROR, {
                    subagentId: this.core.subagentId,
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: Date.now(),
                });
                throw error;
            }
            finally {
                this.core.executionStats.totalDurationMs =
                    Date.now() - this.core.executionStats.startTimeMs;
                const summary = this.core.stats.getSummary(Date.now());
                this.core.eventEmitter?.emit(AgentEventType.FINISH, {
                    subagentId: this.core.subagentId,
                    terminateReason: this.terminateMode,
                    timestamp: Date.now(),
                    rounds: summary.rounds,
                    totalDurationMs: summary.totalDurationMs,
                    totalToolCalls: summary.totalToolCalls,
                    successfulToolCalls: summary.successfulToolCalls,
                    failedToolCalls: summary.failedToolCalls,
                    inputTokens: summary.inputTokens,
                    outputTokens: summary.outputTokens,
                    totalTokens: summary.totalTokens,
                });
                const completionEvent = new SubagentExecutionEvent(this.core.name, this.terminateMode === AgentTerminateMode.GOAL
                    ? 'completed'
                    : 'failed', {
                    terminate_reason: this.terminateMode,
                    result: this.finalText,
                    execution_summary: this.core.stats.formatCompact('Subagent execution completed'),
                });
                logSubagentExecution(this.core.runtimeContext, completionEvent);
                await this.core.hooks?.onStop?.({
                    subagentId: this.core.subagentId,
                    name: this.core.name,
                    terminateReason: this.terminateMode,
                    summary: summary,
                    timestamp: Date.now(),
                });
            }
        }
        finally {
            // Outer finally guarantees the child's parent-signal listener is
            // detached even if prepareTools or initialMessages prep throws before
            // the inner try runs.
            abortController.abort();
        }
    }
    // ─── Accessors ─────────────────────────────────────────────
    /**
     * Provides access to the underlying AgentCore for advanced use cases.
     * Used by AgentInteractive and InProcessBackend.
     */
    getCore() {
        return this.core;
    }
    get executionStats() {
        return this.core.executionStats;
    }
    set executionStats(value) {
        this.core.executionStats = value;
    }
    getEventEmitter() {
        return this.core.getEventEmitter();
    }
    getStatistics() {
        return this.core.getStatistics();
    }
    getExecutionSummary() {
        return this.core.getExecutionSummary();
    }
    getFinalText() {
        return this.finalText;
    }
    getTerminateMode() {
        return this.terminateMode;
    }
    /**
     * Sets a callback that the reasoning loop calls between tool rounds
     * to drain external messages (e.g. from SendMessage tool).
     */
    setExternalMessageProvider(provider) {
        this.externalMessageProvider = provider;
    }
    setExternalMessageWaiter(waiter) {
        this.externalMessageWaiter = waiter;
    }
    setExternalMessageWaitPredicate(predicate) {
        this.externalMessageWaitPredicate = predicate;
    }
    get name() {
        return this.core.name;
    }
    get runtimeContext() {
        return this.core.runtimeContext;
    }
}
//# sourceMappingURL=agent-headless.js.map