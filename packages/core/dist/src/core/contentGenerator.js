/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { getDefaultApiKeyEnvVar, getDefaultModelEnvVar, MissingAnthropicBaseUrlEnvError, MissingApiKeyError, MissingBaseUrlError, MissingModelError, StrictMissingCredentialsError, StrictMissingModelIdError, } from '../models/modelConfigErrors.js';
import { PROVIDER_SOURCED_FIELDS } from '../models/constants.js';
import { preloadRuntimeFetchModule } from '../utils/runtimeFetchOptions.js';
export var AuthType;
(function (AuthType) {
    AuthType["USE_OPENAI"] = "openai";
    AuthType["QWEN_OAUTH"] = "qwen-oauth";
    AuthType["USE_GEMINI"] = "gemini";
    AuthType["USE_VERTEX_AI"] = "vertex-ai";
    AuthType["USE_ANTHROPIC"] = "anthropic";
})(AuthType || (AuthType = {}));
function setSource(sources, path, source) {
    sources[path] = source;
}
function getSeedSource(seed, path) {
    return seed?.[path];
}
/**
 * Resolve ContentGeneratorConfig while tracking the source of each effective field.
 *
 * This function now primarily validates and finalizes the configuration that has
 * already been resolved by ModelConfigResolver. The env fallback logic has been
 * moved to the unified resolver to eliminate duplication.
 *
 * Note: The generationConfig passed here should already be fully resolved with
 * proper source tracking from the caller (CLI/SDK layer).
 */
export function resolveContentGeneratorConfigWithSources(config, authType, generationConfig, seedSources, options) {
    const sources = { ...(seedSources || {}) };
    const strictModelProvider = options?.strictModelProvider === true;
    // Build config with computed fields
    const newContentGeneratorConfig = {
        ...(generationConfig || {}),
        authType,
        proxy: config?.getProxy(),
    };
    // Set sources for computed fields
    setSource(sources, 'authType', {
        kind: 'computed',
        detail: 'provided by caller',
    });
    if (config?.getProxy()) {
        setSource(sources, 'proxy', {
            kind: 'computed',
            detail: 'Config.getProxy()',
        });
    }
    // Preserve seed sources for fields that were passed in
    const seedOrUnknown = (path) => getSeedSource(seedSources, path) ?? { kind: 'unknown' };
    for (const field of PROVIDER_SOURCED_FIELDS) {
        if (generationConfig && field in generationConfig && !sources[field]) {
            setSource(sources, field, seedOrUnknown(field));
        }
    }
    // Validate required fields based on authType. This does not perform any
    // fallback resolution (resolution is handled by ModelConfigResolver).
    const validation = validateModelConfig(newContentGeneratorConfig, strictModelProvider);
    if (!validation.valid) {
        throw new Error(validation.errors.map((e) => e.message).join('\n'));
    }
    return {
        config: newContentGeneratorConfig,
        sources,
    };
}
/**
 * Validate a resolved model configuration.
 * This is the single validation entry point used across Core.
 */
export function validateModelConfig(config, isStrictModelProvider = false) {
    const errors = [];
    // Qwen OAuth doesn't need validation - it uses dynamic tokens
    if (config.authType === AuthType.lailatulcoder_OAUTH) {
        return { valid: true, errors: [] };
    }
    // API key is required for all other auth types
    if (!config.apiKey) {
        if (isStrictModelProvider) {
            errors.push(new StrictMissingCredentialsError(config.authType, config.model, config.apiKeyEnvKey));
        }
        else {
            const envKey = config.apiKeyEnvKey || getDefaultApiKeyEnvVar(config.authType);
            errors.push(new MissingApiKeyError({
                authType: config.authType,
                model: config.model,
                baseUrl: config.baseUrl,
                envKey,
            }));
        }
    }
    // Model is required
    if (!config.model) {
        if (isStrictModelProvider) {
            errors.push(new StrictMissingModelIdError(config.authType));
        }
        else {
            const envKey = getDefaultModelEnvVar(config.authType);
            errors.push(new MissingModelError({ authType: config.authType, envKey }));
        }
    }
    // Explicit baseUrl is required for Anthropic; Migrated from existing code.
    if (config.authType === AuthType.USE_ANTHROPIC && !config.baseUrl) {
        if (isStrictModelProvider) {
            errors.push(new MissingBaseUrlError({
                authType: config.authType,
                model: config.model,
            }));
        }
        else if (config.authType === AuthType.USE_ANTHROPIC) {
            errors.push(new MissingAnthropicBaseUrlEnvError());
        }
    }
    return { valid: errors.length === 0, errors };
}
export function createContentGeneratorConfig(config, authType, generationConfig) {
    return resolveContentGeneratorConfigWithSources(config, authType, generationConfig).config;
}
function getModuleNotFoundError(error) {
    let current = error;
    while (current instanceof Error) {
        if ('code' in current &&
            current.code === 'ERR_MODULE_NOT_FOUND') {
            return current;
        }
        current = current.cause;
    }
    return undefined;
}
function wrapProviderLoadError(error, authType) {
    const moduleNotFoundError = getModuleNotFoundError(error);
    if (!moduleNotFoundError) {
        return error;
    }
    return new Error(`LailatulCoder Ai was updated in the background and needs to be restarted.\n` +
        `Please exit and restart LailatulCoder Ai to use the '${authType}' provider.`, { cause: moduleNotFoundError });
}
class LazyContentGenerator {
    loader;
    summarizedThinking;
    generatorPromise;
    preloadedOnly = false;
    constructor(loader, summarizedThinking) {
        this.loader = loader;
        this.summarizedThinking = summarizedThinking;
    }
    getGenerator() {
        this.generatorPromise ??= this.loader();
        return this.generatorPromise;
    }
    getGeneratorForUse() {
        this.preloadedOnly = false;
        return this.getGenerator();
    }
    preload() {
        if (!this.generatorPromise) {
            this.preloadedOnly = true;
        }
        return this.getGenerator();
    }
    resetPreload() {
        if (!this.preloadedOnly)
            return;
        this.preloadedOnly = false;
        this.generatorPromise = undefined;
    }
    async generateContent(request, userPromptId) {
        return (await this.getGeneratorForUse()).generateContent(request, userPromptId);
    }
    async generateContentStream(request, userPromptId) {
        return (await this.getGeneratorForUse()).generateContentStream(request, userPromptId);
    }
    async countTokens(request) {
        return (await this.getGeneratorForUse()).countTokens(request);
    }
    async embedContent(request) {
        return (await this.getGeneratorForUse()).embedContent(request);
    }
    useSummarizedThinking() {
        return this.summarizedThinking;
    }
}
/** @internal */
export async function preloadContentGenerator(generator) {
    if (generator instanceof LazyContentGenerator) {
        await generator.preload();
    }
}
/** @internal */
export function resetPreloadedContentGenerator(generator) {
    if (generator instanceof LazyContentGenerator) {
        generator.resetPreload();
    }
}
export async function createContentGenerator(generatorConfig, config, isInitialAuth) {
    const validation = validateModelConfig(generatorConfig, false);
    if (!validation.valid) {
        throw new Error(validation.errors.map((e) => e.message).join('\n'));
    }
    const authType = generatorConfig.authType;
    if (!authType) {
        throw new Error('ContentGeneratorConfig must have an authType');
    }
    // Provider constructors below synchronously build undici-backed fetch
    // options; load undici here so it stays out of the eager startup closure
    // (issue #7264).
    await preloadRuntimeFetchModule();
    let loadBaseGenerator;
    try {
        if (authType === AuthType.USE_OPENAI) {
            loadBaseGenerator = async () => {
                const { createOpenAIContentGenerator } = await import('./openaiContentGenerator/index.js');
                return createOpenAIContentGenerator(generatorConfig, config);
            };
        }
        else if (authType === AuthType.lailatulcoder_OAUTH) {
            const { getQwenOAuthClient: getQwenOauthClient } = await import('../qwen/qwenOAuth2.js');
            try {
                const qwenClient = await getQwenOauthClient(config, isInitialAuth ? { requireCachedCredentials: true } : undefined);
                loadBaseGenerator = async () => {
                    const { QwenContentGenerator } = await import('../qwen/qwenContentGenerator.js');
                    return new QwenContentGenerator(qwenClient, generatorConfig, config);
                };
            }
            catch (error) {
                if (getModuleNotFoundError(error)) {
                    throw error;
                }
                throw new Error(error instanceof Error ? error.message : String(error));
            }
        }
        else if (authType === AuthType.USE_ANTHROPIC) {
            loadBaseGenerator = async () => {
                const { createAnthropicContentGenerator } = await import('./anthropicContentGenerator/index.js');
                return createAnthropicContentGenerator(generatorConfig, config);
            };
        }
        else if (authType === AuthType.USE_GEMINI ||
            authType === AuthType.USE_VERTEX_AI) {
            loadBaseGenerator = async () => {
                const { createGeminiContentGenerator } = await import('./geminiContentGenerator/index.js');
                return createGeminiContentGenerator(generatorConfig, config);
            };
        }
        else {
            throw new Error(`Error creating contentGenerator: Unsupported authType: ${authType}`);
        }
    }
    catch (error) {
        throw wrapProviderLoadError(error, authType);
    }
    return new LazyContentGenerator(async () => {
        try {
            const [baseGenerator, { LoggingContentGenerator }] = await Promise.all([
                loadBaseGenerator(),
                import('./loggingContentGenerator/index.js'),
            ]);
            return new LoggingContentGenerator(baseGenerator, config, generatorConfig);
        }
        catch (error) {
            throw wrapProviderLoadError(error, authType);
        }
    }, authType === AuthType.USE_GEMINI || authType === AuthType.USE_VERTEX_AI);
}
//# sourceMappingURL=contentGenerator.js.map