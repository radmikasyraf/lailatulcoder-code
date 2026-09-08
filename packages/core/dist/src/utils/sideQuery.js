/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFile } from 'node:fs/promises';
import { DEFAULT_QWEN_MODEL } from '../config/models.js';
import { SchemaValidator } from './schemaValidator.js';
function buildDefaultPromptId(purpose) {
    return purpose ? `side-query:${purpose}` : 'side-query';
}
function resolveDefaultModel(config, override) {
    return (override ??
        config.getFastModel?.() ??
        config.getModel() ??
        DEFAULT_QWEN_MODEL);
}
function applyThinkingDefault(callerConfig) {
    const thinkingOverride = callerConfig?.thinkingConfig;
    return {
        ...(callerConfig ?? {}),
        thinkingConfig: thinkingOverride
            ? { includeThoughts: false, ...thinkingOverride }
            : { includeThoughts: false },
    };
}
async function getOutputLanguageInstruction(config) {
    const outputLanguageFilePath = config.getOutputLanguageFilePath?.();
    if (!outputLanguageFilePath)
        return undefined;
    try {
        const preference = (await readFile(outputLanguageFilePath, 'utf8')).trim();
        if (!preference)
            return undefined;
        return [
            'Follow the user-visible output language preference below for this side query.',
            'This preference overrides any earlier language-selection rule in this system instruction.',
            preference,
        ].join('\n\n');
    }
    catch {
        return undefined;
    }
}
function appendSystemInstruction(systemInstruction, outputLanguageInstruction) {
    if (!outputLanguageInstruction)
        return systemInstruction;
    if (systemInstruction === undefined)
        return outputLanguageInstruction;
    if (typeof systemInstruction === 'string') {
        return `${systemInstruction}\n\n${outputLanguageInstruction}`;
    }
    if (Array.isArray(systemInstruction)) {
        return [...systemInstruction, { text: outputLanguageInstruction }];
    }
    if (typeof systemInstruction === 'object' &&
        'parts' in systemInstruction &&
        Array.isArray(systemInstruction.parts)) {
        return {
            ...systemInstruction,
            parts: [...systemInstruction.parts, { text: outputLanguageInstruction }],
        };
    }
    return [systemInstruction, { text: outputLanguageInstruction }];
}
function isJsonOptions(options) {
    return (options.schema !== undefined &&
        options.schema !== null);
}
export async function runSideQuery(config, options) {
    const model = resolveDefaultModel(config, options.model);
    const promptId = options.promptId ?? buildDefaultPromptId(options.purpose);
    const requestConfig = applyThinkingDefault(options.config);
    const outputLanguageInstruction = options.skipOutputLanguagePreference
        ? undefined
        : await getOutputLanguageInstruction(config);
    const systemInstruction = appendSystemInstruction(options.systemInstruction, outputLanguageInstruction);
    if (isJsonOptions(options)) {
        const response = (await config.getBaseLlmClient().generateJson({
            contents: options.contents,
            schema: options.schema,
            abortSignal: options.abortSignal,
            model,
            systemInstruction,
            promptId,
            config: requestConfig,
            ...(options.maxAttempts !== undefined && {
                maxAttempts: options.maxAttempts,
            }),
        }));
        const schemaError = SchemaValidator.validate(options.schema, response);
        if (schemaError) {
            throw new Error(`Invalid side query response: ${schemaError}`);
        }
        const customError = options.validate?.(response);
        if (customError) {
            throw new Error(customError);
        }
        return response;
    }
    const result = await config.getBaseLlmClient().generateText({
        contents: options.contents,
        model,
        systemInstruction,
        abortSignal: options.abortSignal,
        promptId,
        config: requestConfig,
        ...(options.maxAttempts !== undefined && {
            maxAttempts: options.maxAttempts,
        }),
        ...(options.stream !== undefined && { stream: options.stream }),
        ...(options.failClosed !== undefined && { failClosed: options.failClosed }),
    });
    const customError = options.validate?.(result.text);
    if (customError) {
        throw new Error(customError);
    }
    return result;
}
//# sourceMappingURL=sideQuery.js.map