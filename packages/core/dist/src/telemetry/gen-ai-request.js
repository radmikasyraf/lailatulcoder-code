/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { context, createContextKey, ROOT_CONTEXT, } from '@opentelemetry/api';
import { extractAnthropicContent, extractGeminiContent, extractOpenAiContent, GenAiOutputAccumulator, stringifyGenAiJson, } from './gen-ai-content.js';
import { createDebugLogger } from '../utils/debugLogger.js';
const debugLogger = createDebugLogger('GEN_AI_EXCHANGE');
const requestObserverKey = createContextKey('lailatul-coder.gen-ai-request-observer');
const DISABLED_OBSERVER = Symbol('disabled-gen-ai-exchange');
function ownValue(record, key) {
    return Object.hasOwn(record, key) ? record[key] : undefined;
}
function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
}
function safeInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value)
        ? value
        : undefined;
}
function stopSequences(value, allowSingleString) {
    if (allowSingleString && typeof value === 'string')
        return [value];
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
        return undefined;
    return [...value];
}
function outputBudget(record) {
    const values = ['max_tokens', 'max_completion_tokens', 'max_new_tokens']
        .map((key) => ownValue(record, key))
        .filter((value) => value !== undefined && value !== null);
    if (values.length === 0)
        return undefined;
    const integers = values.map(safeInteger);
    if (integers.some((value) => value === undefined))
        return undefined;
    const first = integers[0];
    return integers.every((value) => value === first) ? first : undefined;
}
function assignNumber(attributes, key, value) {
    const number = finiteNumber(value);
    if (number !== undefined)
        attributes[key] = number;
}
function assignInteger(attributes, key, value) {
    const integer = safeInteger(value);
    if (integer !== undefined)
        attributes[key] = integer;
}
function assignStopSequences(attributes, value, allowSingleString) {
    const sequences = stopSequences(value, allowSingleString);
    if (sequences !== undefined)
        attributes['gen_ai.request.stop_sequences'] = sequences;
}
export function extractOpenAiRequestAttributes(request) {
    const record = request;
    const attributes = {};
    const choiceCount = safeInteger(ownValue(record, 'n'));
    if (choiceCount !== undefined && choiceCount !== 1) {
        attributes['gen_ai.request.choice.count'] = choiceCount;
    }
    const maxTokens = outputBudget(record);
    if (maxTokens !== undefined) {
        attributes['gen_ai.request.max_tokens'] = maxTokens;
    }
    assignNumber(attributes, 'gen_ai.request.temperature', ownValue(record, 'temperature'));
    assignNumber(attributes, 'gen_ai.request.top_p', ownValue(record, 'top_p'));
    assignNumber(attributes, 'gen_ai.request.frequency_penalty', ownValue(record, 'frequency_penalty'));
    assignNumber(attributes, 'gen_ai.request.presence_penalty', ownValue(record, 'presence_penalty'));
    assignStopSequences(attributes, ownValue(record, 'stop'), true);
    return attributes;
}
export function extractAnthropicRequestAttributes(request) {
    const record = request;
    const attributes = {};
    assignInteger(attributes, 'gen_ai.request.max_tokens', ownValue(record, 'max_tokens'));
    assignNumber(attributes, 'gen_ai.request.temperature', ownValue(record, 'temperature'));
    assignNumber(attributes, 'gen_ai.request.top_p', ownValue(record, 'top_p'));
    assignStopSequences(attributes, ownValue(record, 'stop_sequences'), false);
    return attributes;
}
export function extractGeminiRequestAttributes(request) {
    const record = request;
    const config = ownValue(record, 'config');
    if (typeof config !== 'object' || config === null)
        return {};
    const configRecord = config;
    const attributes = {};
    const choiceCount = safeInteger(ownValue(configRecord, 'candidateCount'));
    if (choiceCount !== undefined && choiceCount !== 1) {
        attributes['gen_ai.request.choice.count'] = choiceCount;
    }
    assignInteger(attributes, 'gen_ai.request.max_tokens', ownValue(configRecord, 'maxOutputTokens'));
    assignNumber(attributes, 'gen_ai.request.temperature', ownValue(configRecord, 'temperature'));
    assignNumber(attributes, 'gen_ai.request.top_p', ownValue(configRecord, 'topP'));
    assignNumber(attributes, 'gen_ai.request.frequency_penalty', ownValue(configRecord, 'frequencyPenalty'));
    assignNumber(attributes, 'gen_ai.request.presence_penalty', ownValue(configRecord, 'presencePenalty'));
    assignStopSequences(attributes, ownValue(configRecord, 'stopSequences'), false);
    return attributes;
}
export class GenAiExchangeController {
    span;
    options;
    enabled;
    requestConsumed = false;
    generation = 0;
    finalized = false;
    output;
    responseConversionFailed = false;
    constructor(span, options, enabled) {
        this.span = span;
        this.options = options;
        this.enabled = enabled;
        this.output = this.newOutput();
    }
    beginRequest(request, extractRequest, extractContent) {
        if (!this.enabled || this.finalized)
            return undefined;
        const generation = ++this.generation;
        this.output = this.newOutput();
        this.responseConversionFailed = false;
        if (!this.requestConsumed) {
            this.requestConsumed = true;
            const attributes = {};
            try {
                Object.assign(attributes, extractRequest(request));
                if (this.options.captureContent) {
                    const content = extractContent(request);
                    this.assignJsonAttribute(attributes, 'gen_ai.input.messages', content.inputMessages);
                    this.assignJsonAttribute(attributes, 'gen_ai.system_instructions', content.systemInstructions);
                    this.assignJsonAttribute(attributes, 'gen_ai.tool.definitions', content.toolDefinitions);
                }
            }
            catch {
                debugLogger.debug('Failed to convert GenAI request attributes');
                // The first snapshot remains consumed when conversion fails.
            }
            try {
                this.span.setAttributes(attributes);
            }
            catch {
                debugLogger.debug('Failed to set GenAI request span attributes');
            }
        }
        return { controller: this, generation };
    }
    beginFollowingRequest(handle, request, extractRequest, extractContent) {
        if (handle.controller !== this ||
            handle.generation !== this.generation ||
            this.finalized) {
            return undefined;
        }
        return this.beginRequest(request, extractRequest, extractContent);
    }
    record(handle, update) {
        if (!handle ||
            handle.controller !== this ||
            handle.generation !== this.generation ||
            this.finalized) {
            return;
        }
        try {
            update(this.output);
        }
        catch {
            this.output.discardContent();
            this.responseConversionFailed = true;
            debugLogger.debug('Failed to convert GenAI response content');
        }
    }
    finalize(success) {
        if (this.finalized)
            return undefined;
        this.finalized = true;
        let finishReasons;
        try {
            const outputMessages = this.output.finalize(success);
            finishReasons = this.responseConversionFailed
                ? undefined
                : this.output.finishReasons;
            if (outputMessages !== undefined) {
                this.span.setAttribute('gen_ai.output.messages', outputMessages);
            }
        }
        catch {
            debugLogger.debug('Failed to finalize GenAI response attributes');
        }
        finally {
            this.output = this.newOutput();
        }
        return finishReasons;
    }
    assignJsonAttribute(attributes, key, value) {
        if (value === undefined)
            return;
        let serialized;
        try {
            serialized = stringifyGenAiJson(value, this.options.sensitiveAttributeMaxLength);
        }
        catch {
            debugLogger.debug(`Failed to serialize ${key} span attribute`);
            return;
        }
        if (serialized !== undefined)
            attributes[key] = serialized;
    }
    newOutput() {
        return new GenAiOutputAccumulator(this.options.captureContent, this.options.sensitiveAttributeMaxLength);
    }
}
function disabledFallbackContext(parent) {
    // Preserve every other Context behavior through the parent prototype while
    // shadowing key operations so a failed setValue cannot expose an ancestor
    // observer to this exchange.
    const fallback = Object.create(parent);
    fallback.getValue = (key) => {
        if (key === requestObserverKey)
            return DISABLED_OBSERVER;
        try {
            return parent.getValue(key);
        }
        catch {
            return undefined;
        }
    };
    fallback.setValue = (key, value) => {
        if (key === requestObserverKey)
            return fallback;
        try {
            return disabledFallbackContext(parent.setValue(key, value));
        }
        catch {
            return fallback;
        }
    };
    fallback.deleteValue = (key) => {
        if (key === requestObserverKey)
            return fallback;
        try {
            return disabledFallbackContext(parent.deleteValue(key));
        }
        catch {
            return fallback;
        }
    };
    return fallback;
}
export function createGenAiExchange(parent, span, options) {
    let enabled = false;
    try {
        enabled = span.isRecording();
    }
    catch {
        enabled = false;
    }
    const controller = new GenAiExchangeController(span, options, enabled);
    try {
        return {
            context: parent.setValue(requestObserverKey, enabled ? controller : DISABLED_OBSERVER),
            controller,
        };
    }
    catch {
        return {
            context: parent === ROOT_CONTEXT
                ? ROOT_CONTEXT
                : disabledFallbackContext(parent),
            controller,
        };
    }
}
/**
 * @deprecated Use createGenAiExchange so response attempts can be finalized.
 */
export function createGenAiRequestObserverContext(parent, span) {
    return createGenAiExchange(parent, span, {
        captureContent: false,
        sensitiveAttributeMaxLength: 1,
    }).context;
}
function activeController(requestContext) {
    let observer;
    try {
        observer = (requestContext ?? context.active()).getValue(requestObserverKey);
    }
    catch {
        return undefined;
    }
    return observer instanceof GenAiExchangeController ? observer : undefined;
}
function reportRequest(request, extractRequest, extractContent, requestContext, previousAttempt) {
    try {
        if (previousAttempt) {
            return previousAttempt.controller.beginFollowingRequest(previousAttempt, request, extractRequest, extractContent);
        }
        return activeController(requestContext)?.beginRequest(request, extractRequest, extractContent);
    }
    catch {
        return undefined;
    }
}
export function reportOpenAiRequest(request, requestContext) {
    return reportRequest(request, extractOpenAiRequestAttributes, extractOpenAiContent, requestContext);
}
export function reportAnthropicRequest(request, requestContext) {
    return reportRequest(request, extractAnthropicRequestAttributes, extractAnthropicContent, requestContext);
}
export function reportAnthropicFollowingRequest(request, previousAttempt) {
    if (!previousAttempt)
        return undefined;
    return reportRequest(request, extractAnthropicRequestAttributes, extractAnthropicContent, undefined, previousAttempt);
}
export function reportGeminiRequest(request, requestContext) {
    return reportRequest(request, extractGeminiRequestAttributes, extractGeminiContent, requestContext);
}
export function reportOpenAiResponse(handle, response) {
    handle?.controller.record(handle, (output) => output.recordOpenAiResponse(response));
}
export function reportOpenAiChunk(handle, chunk) {
    handle?.controller.record(handle, (output) => output.recordOpenAiChunk(chunk));
}
export function reportAnthropicResponse(handle, response) {
    handle?.controller.record(handle, (output) => output.recordAnthropicResponse(response));
}
export function reportAnthropicEvent(handle, event) {
    handle?.controller.record(handle, (output) => output.recordAnthropicEvent(event));
}
export function reportGeminiResponse(handle, response) {
    handle?.controller.record(handle, (output) => output.recordGeminiResponse(response));
}
export function reportGeminiChunk(handle, chunk) {
    handle?.controller.record(handle, (output) => output.recordGeminiChunk(chunk));
}
//# sourceMappingURL=gen-ai-request.js.map