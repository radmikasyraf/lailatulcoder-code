/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from '../contentGenerator.js';
const CACHE_KEY_PREFIX = 'lailatul-coder:';
const EXPLICIT_BREAKPOINT_COUNT = 2;
export function supportsOpenAIPrefixCaching(contentGeneratorConfig) {
    return (contentGeneratorConfig.authType === AuthType.USE_OPENAI ||
        contentGeneratorConfig.authType === AuthType.lailatulcoder_OAUTH);
}
export function isOfficialOpenAIEndpoint(contentGeneratorConfig) {
    if (contentGeneratorConfig.authType !== AuthType.USE_OPENAI)
        return false;
    const { baseUrl } = contentGeneratorConfig;
    // An unset base URL is routed to the DashScope provider by provider
    // selection, so only an explicit official OpenAI endpoint qualifies.
    if (!baseUrl)
        return false;
    try {
        return new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
    }
    catch {
        return false;
    }
}
export function supportsExplicitOpenAIPromptCaching(model) {
    const match = /^gpt-(\d+)(?:\.(\d+))?(?:[-.]|$)/i.exec(model);
    if (!match)
        return false;
    const major = Number(match[1]);
    const minor = Number(match[2] ?? 0);
    return major > 5 || (major === 5 && minor >= 6);
}
function withCacheBreakpoint(message) {
    if (message.role !== 'user' && message.role !== 'tool')
        return undefined;
    const marker = { prompt_cache_breakpoint: { mode: 'explicit' } };
    if (typeof message.content === 'string') {
        return {
            ...message,
            content: [{ type: 'text', text: message.content, ...marker }],
        };
    }
    if (!Array.isArray(message.content) || message.content.length === 0) {
        return undefined;
    }
    const content = [...message.content];
    const lastIndex = content.length - 1;
    content[lastIndex] = { ...content[lastIndex], ...marker };
    return { ...message, content };
}
export function applyOfficialOpenAIPromptCaching(request, sessionId, cacheSharing, cacheKeyPartition) {
    const result = { ...request };
    if (sessionId && !result.prompt_cache_key) {
        const partition = cacheKeyPartition ? `:${cacheKeyPartition}` : '';
        result.prompt_cache_key = `${CACHE_KEY_PREFIX}${sessionId}${partition}`;
    }
    if (!cacheSharing || !supportsExplicitOpenAIPromptCaching(request.model)) {
        return result;
    }
    const messages = [...request.messages];
    let marked = 0;
    // Skip the trailing compression directive. Two earlier user/tool boundaries
    // cover both the last main request and an unsent pending tool result.
    for (let index = messages.length - 2; index >= 0 && marked < EXPLICIT_BREAKPOINT_COUNT; index -= 1) {
        const message = messages[index];
        const updated = message ? withCacheBreakpoint(message) : undefined;
        if (!updated)
            continue;
        messages[index] = updated;
        marked += 1;
    }
    if (marked === 0)
        return result;
    result.messages = messages;
    result.prompt_cache_options = {
        ...result.prompt_cache_options,
        mode: 'explicit',
    };
    return result;
}
//# sourceMappingURL=prefix-caching.js.map