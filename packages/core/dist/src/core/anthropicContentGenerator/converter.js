/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { FinishReason, GenerateContentResponse } from '@google/genai';
import { buildAnthropicUsageMetadata } from './usage.js';
import { safeJsonParse } from '../../utils/safeJsonParse.js';
import { convertSchema, } from '../../utils/schemaConverter.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
import { normalizeMcpToolName } from '../../utils/tool-name-utils.js';
const debugLogger = createDebugLogger('AnthropicConverter');
export class AnthropicContentConverter {
    schemaCompliance;
    enableCacheControl;
    /**
     * Per-request tool ID sanitization state (see {@link resolveToolUseId}).
     * The converter instance is long-lived across requests (constructed once
     * per generator), so this state is reset at the top of every
     * `convertGeminiRequestToAnthropic` call rather than at construction.
     */
    toolIdMap = new Map();
    usedToolIds = new Set();
    generatedToolIdCounter = 0;
    constructor(_model, schemaCompliance = 'auto', enableCacheControl = true) {
        this.schemaCompliance = schemaCompliance;
        this.enableCacheControl = enableCacheControl;
    }
    convertGeminiRequestToAnthropic(request, options = {}) {
        this.resetToolIdState();
        let messages = [];
        const systemText = this.extractTextFromContentUnion(request.config?.systemInstruction);
        this.processContents(request.contents, messages);
        if (options.stripAssistantThinking) {
            this.stripThinkingFromAssistantMessages(messages);
        }
        // Normalization runs before injection so non-compliant blocks are seen
        // as already-present (and not duplicated) by the injection pass.
        if (options.normalizeAssistantThinkingSignature) {
            this.fillMissingThinkingSignatures(messages);
        }
        if (options.injectThinkingOnToolUseTurns) {
            this.injectEmptyThinkingOnToolUseTurns(messages);
        }
        // Merge consecutive assistant messages and clean orphaned tool calls.
        // When the Gemini history has consecutive model turns (e.g. from
        // streaming chunk-level recording, max_tokens recovery, or adaptive
        // thinking splits), processContent emits one Anthropic message per
        // Content. The Anthropic API requires that tool_use blocks be
        // immediately followed by tool_result blocks in the next message —
        // consecutive assistant messages break this pairing and cause HTTP 400
        // "tool_use ids were found without tool_result blocks immediately
        // after". Mirrors the same functions in the OpenAI converter.
        messages = mergeConsecutiveAssistantMessages(messages);
        messages = cleanOrphanedToolCalls(messages);
        messages = mergeConsecutiveAssistantMessages(messages);
        // Must run BEFORE dropEmptyTextThinkingBlocks: dropUnsignedThinking...
        // throws when an unsigned thinking block belongs to a turn that's part
        // of an unbroken, still-active tool_use/tool_result chain reaching the
        // end of history -- a real proxy bug that should fail loudly rather
        // than silently continue. An empty-text thinking block with no
        // signature is unsigned by this same definition; if the empty-text
        // guard ran first it would delete the block outright before this
        // check ever saw it, silently swallowing exactly the proxy bug this
        // throw exists to surface (the same pass-ordering hazard raised
        // against the removed PATCH-B heuristic, which retyped instead of
        // deleted but had the identical effect of hiding the block from this
        // check).
        if (options.dropUnsignedAssistantThinking) {
            messages = this.dropUnsignedThinkingFromAssistantMessages(messages);
        }
        // Defense-in-depth against an empty-text thinking block surviving into
        // a non-latest turn (see dropEmptyTextThinkingBlocks's doc) -- e.g. one
        // that DOES carry a signature, so dropUnsignedThinkingFromAssistant...
        // above leaves it alone. Skipped for DeepSeek's injectThinkingOnToolUseTurns
        // path: DeepSeek's synthetic thinking placeholder (injected above) is
        // deliberately `{type:'thinking', thinking:'', signature:''}` on every
        // tool-use turn, and DeepSeek doesn't validate a signature the way
        // Anthropic does, so this guard would strip the very placeholder
        // DeepSeek needs.
        if (!options.injectThinkingOnToolUseTurns) {
            messages = dropEmptyTextThinkingBlocks(messages);
        }
        if (options.stripAssistantThinking) {
            this.stripThinkingFromAssistantMessages(messages);
        }
        messages = mergeConsecutiveUserMessages(messages);
        if (options.stripTrailingAssistantPrefill) {
            this.stripTrailingAssistantPrefill(messages);
        }
        // Add cache_control to enable prompt caching (if enabled). Prefer the
        // per-call override when the caller (typically the generator) passes
        // one — that path latches the live config value alongside the
        // per-request beta-header decision so the two stay in sync after
        // `Config.setModel()` mutates `enableCacheControl` mid-session.
        // `useGlobalCacheScope` is independent of (and a strict subset of)
        // `enableCacheControl`: it only controls whether the emitted
        // cache_control carries `scope: 'global'`, not whether the
        // cache_control itself is emitted.
        const enableCacheControl = options.enableCacheControl ?? this.enableCacheControl;
        const useGlobalCacheScope = options.useGlobalCacheScope ?? false;
        const cacheRetention = options.cacheRetention ?? 'ephemeral';
        const cacheRetentionByBlock = options.cacheRetentionByBlock ?? {};
        const system = enableCacheControl
            ? this.buildSystemWithCacheControl(systemText, useGlobalCacheScope, options.staticSystemPrefix, this.resolveCacheRetention('system', cacheRetention, cacheRetentionByBlock))
            : systemText;
        if (enableCacheControl) {
            this.addCacheControlToMessages(messages, this.resolveCacheRetention('user.last', cacheRetention, cacheRetentionByBlock));
        }
        return {
            system,
            messages,
        };
    }
    async convertGeminiToolsToAnthropic(geminiTools, options = {}) {
        const tools = [];
        for (const tool of geminiTools) {
            let actualTool;
            if ('tool' in tool) {
                actualTool = await tool.tool();
            }
            else {
                actualTool = tool;
            }
            if (!actualTool.functionDeclarations) {
                continue;
            }
            for (const func of actualTool.functionDeclarations) {
                // Skip functions without name or description (required by Anthropic API)
                if (!func.name || !func.description)
                    continue;
                let inputSchema;
                if (func.parametersJsonSchema) {
                    inputSchema = {
                        ...func.parametersJsonSchema,
                    };
                }
                else if (func.parameters) {
                    inputSchema = func.parameters;
                }
                if (!inputSchema) {
                    inputSchema = { type: 'object', properties: {} };
                }
                inputSchema = convertSchema(inputSchema, this.schemaCompliance);
                if (typeof inputSchema['type'] !== 'string') {
                    inputSchema['type'] = 'object';
                }
                tools.push({
                    name: func.name,
                    description: func.description,
                    input_schema: inputSchema,
                });
            }
        }
        // Add cache_control to the last tool for prompt caching (if enabled).
        // When `useGlobalCacheScope` is set, attach `scope: 'global'` so
        // identical tool prefixes are cached across sessions — tools tend to
        // be the largest, slowest-changing prefix (often 5K+ tokens), so
        // cross-session reuse is where most of the hit-rate improvement under
        // `prompt-caching-scope-2026-01-05` shows up. Non-Anthropic baseURLs
        // ship the standard per-session shape so they don't see a scope
        // extension they may not recognize.
        // Per-call overrides mirror the request-shape gates in
        // `convertGeminiRequestToAnthropic` so a qwen-oauth-style hot flip of
        // `enableCacheControl` (the only field `Config.handleModelChange()`
        // mutates in place without recreating the generator) doesn't leave
        // the tool body and the beta header out of sync. `baseUrl` isn't
        // hot-mutated — non-qwen-oauth providers recreate the generator on
        // refresh — but the same per-call plumbing covers it for free.
        const enableCacheControl = options.enableCacheControl ?? this.enableCacheControl;
        const useGlobalCacheScope = options.useGlobalCacheScope ?? false;
        if (enableCacheControl && tools.length > 0) {
            const lastToolIndex = tools.length - 1;
            const resolvedRetention = this.resolveCacheRetention('tool', options.cacheRetention ?? 'ephemeral', options.cacheRetentionByBlock ?? {});
            tools[lastToolIndex] = {
                ...tools[lastToolIndex],
                cache_control: {
                    type: 'ephemeral',
                    ...(useGlobalCacheScope ? { scope: 'global' } : {}),
                    ...(resolvedRetention === '1h' ? { ttl: '1h' } : {}),
                },
            };
        }
        return tools;
    }
    convertAnthropicResponseToGemini(response) {
        const geminiResponse = new GenerateContentResponse();
        const parts = [];
        for (const block of response.content || []) {
            const blockType = String(block['type'] || '');
            if (blockType === 'text') {
                const text = typeof block.text === 'string'
                    ? block.text
                    : '';
                if (text) {
                    parts.push({ text });
                }
            }
            else if (blockType === 'tool_use') {
                const toolUse = block;
                parts.push({
                    functionCall: {
                        id: typeof toolUse.id === 'string' ? toolUse.id : undefined,
                        name: typeof toolUse.name === 'string' ? toolUse.name : undefined,
                        args: this.safeInputToArgs(toolUse.input),
                    },
                });
            }
            else if (blockType === 'thinking') {
                const thinking = typeof block.thinking === 'string'
                    ? block.thinking
                    : '';
                const signature = typeof block.signature === 'string'
                    ? block.signature
                    : '';
                if (thinking || signature) {
                    const thoughtPart = {
                        text: thinking,
                        thought: true,
                        thoughtSignature: signature,
                    };
                    parts.push(thoughtPart);
                }
            }
            else if (blockType === 'redacted_thinking') {
                parts.push({ text: '', thought: true });
            }
        }
        const candidate = {
            content: {
                parts,
                role: 'model',
            },
            index: 0,
            safetyRatings: [],
        };
        const finishReason = this.mapAnthropicFinishReasonToGemini(response.stop_reason);
        if (finishReason) {
            candidate.finishReason = finishReason;
        }
        geminiResponse.candidates = [candidate];
        geminiResponse.responseId = response.id;
        geminiResponse.createTime = Date.now().toString();
        geminiResponse.modelVersion = response.model || undefined;
        geminiResponse.promptFeedback = { safetyRatings: [] };
        if (response.usage) {
            geminiResponse.usageMetadata = buildAnthropicUsageMetadata({
                inputTokens: response.usage.input_tokens || 0,
                cacheReadTokens: response.usage.cache_read_input_tokens || 0,
                cacheCreationTokens: response.usage.cache_creation_input_tokens || 0,
                outputTokens: response.usage.output_tokens || 0,
                cacheReadTokensReported: typeof response.usage.cache_read_input_tokens === 'number',
                cacheCreationTokensReported: typeof response.usage.cache_creation_input_tokens === 'number',
            });
        }
        return geminiResponse;
    }
    processContents(contents, messages) {
        if (Array.isArray(contents)) {
            for (const content of contents) {
                this.processContent(content, messages);
            }
        }
        else if (contents) {
            this.processContent(contents, messages);
        }
    }
    processContent(content, messages) {
        if (typeof content === 'string') {
            messages.push({
                role: 'user',
                content: [{ type: 'text', text: content }],
            });
            return;
        }
        if (!this.isContentObject(content))
            return;
        const parts = content.parts || [];
        const role = content.role === 'model' ? 'assistant' : 'user';
        const contentBlocks = [];
        for (const part of parts) {
            if (typeof part === 'string') {
                contentBlocks.push({ type: 'text', text: part });
                continue;
            }
            if ('text' in part && 'thought' in part && part.thought) {
                if (role === 'assistant') {
                    const thinkingBlock = {
                        type: 'thinking',
                        thinking: part.text || '',
                    };
                    if ('thoughtSignature' in part &&
                        typeof part.thoughtSignature === 'string') {
                        thinkingBlock.signature =
                            part.thoughtSignature;
                    }
                    contentBlocks.push(thinkingBlock);
                }
            }
            if ('text' in part && part.text && !('thought' in part && part.thought)) {
                contentBlocks.push({ type: 'text', text: part.text });
            }
            const mediaBlock = this.createMediaBlockFromPart(part);
            if (mediaBlock) {
                contentBlocks.push(mediaBlock);
            }
            if ('functionCall' in part && part.functionCall) {
                if (role === 'assistant') {
                    contentBlocks.push({
                        type: 'tool_use',
                        id: this.resolveToolUseId(part.functionCall.id),
                        name: normalizeMcpToolName(part.functionCall.name || ''),
                        input: part.functionCall.args || {},
                    });
                }
            }
            if (part.functionResponse) {
                const toolResultBlock = this.createToolResultBlock(part.functionResponse);
                if (toolResultBlock && role === 'user') {
                    contentBlocks.push(toolResultBlock);
                }
            }
        }
        if (contentBlocks.length > 0) {
            // Anthropic requires tool_result to be the first content in a user
            // message replying to a tool_use -- it doesn't scan past a leading
            // non-tool_result block to find the result later in the same
            // message. The source Gemini parts can arrive in any order (e.g. a
            // text part preceding the functionResponse part within the same
            // Content), so move tool_result blocks to the front of a user
            // message whenever any are present. A stable sort preserves the
            // relative order of multiple tool_result blocks against each other.
            if (role === 'user' &&
                contentBlocks.some((b) => b.type === 'tool_result')) {
                contentBlocks.sort((a, b) => {
                    if (a.type === 'tool_result' && b.type !== 'tool_result')
                        return -1;
                    if (a.type !== 'tool_result' && b.type === 'tool_result')
                        return 1;
                    return 0;
                });
            }
            messages.push({ role, content: contentBlocks });
        }
    }
    createToolResultBlock(response) {
        const textContent = this.extractFunctionResponseContent(response.response);
        const partBlocks = [];
        for (const part of response.parts || []) {
            const block = this.createMediaBlockFromPart(part);
            if (block) {
                partBlocks.push(block);
            }
        }
        let content;
        if (partBlocks.length > 0) {
            const blocks = [];
            if (textContent) {
                blocks.push({ type: 'text', text: textContent });
            }
            blocks.push(...partBlocks);
            content = blocks;
        }
        else {
            content = textContent;
        }
        return {
            type: 'tool_result',
            tool_use_id: this.resolveToolUseId(response.id),
            content,
            ...(response.response &&
                Object.prototype.hasOwnProperty.call(response.response, 'error')
                ? { is_error: true }
                : {}),
        };
    }
    resetToolIdState() {
        this.toolIdMap.clear();
        this.usedToolIds.clear();
        this.generatedToolIdCounter = 0;
    }
    /**
     * Resolve a `functionCall.id` / `functionResponse.id` into a wire-safe
     * `tool_use.id` / `tool_result.tool_use_id`. Anthropic validates both
     * fields against `^[a-zA-Z0-9_-]+$` server-side (HTTP 400 otherwise) and
     * rejects the empty string the same way, since `+` requires at least one
     * character. The Gemini lingua-franca's `id` field has no such
     * constraint -- it can carry another provider's ID scheme, a
     * composite/namespaced ID, or be entirely absent.
     *
     * The same source ID always resolves to the same wire ID within a
     * request (memoized in `toolIdMap`), so a `tool_use`/`tool_result` pair
     * that shares a source ID still links up correctly after sanitization.
     * State is scoped to a single `convertGeminiRequestToAnthropic` call
     * (reset via {@link resetToolIdState}), since the converter instance
     * itself is long-lived across requests.
     */
    resolveToolUseId(rawId) {
        const sourceId = typeof rawId === 'string' ? rawId.trim() : '';
        const existingId = sourceId ? this.toolIdMap.get(sourceId) : undefined;
        if (existingId) {
            return existingId;
        }
        const baseId = sourceId
            ? this.sanitizeToolUseId(sourceId)
            : this.nextGeneratedToolId();
        const uniqueId = this.makeUniqueToolUseId(baseId);
        if (sourceId) {
            this.toolIdMap.set(sourceId, uniqueId);
        }
        return uniqueId;
    }
    sanitizeToolUseId(id) {
        const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        return cleaned || this.nextGeneratedToolId();
    }
    nextGeneratedToolId() {
        const id = `tool_${this.generatedToolIdCounter}`;
        this.generatedToolIdCounter += 1;
        return id;
    }
    makeUniqueToolUseId(baseId) {
        if (!this.usedToolIds.has(baseId)) {
            this.usedToolIds.add(baseId);
            return baseId;
        }
        let suffix = 1;
        let candidate = `${baseId}_${suffix}`;
        while (this.usedToolIds.has(candidate)) {
            suffix += 1;
            candidate = `${baseId}_${suffix}`;
        }
        this.usedToolIds.add(candidate);
        return candidate;
    }
    createMediaBlockFromPart(part) {
        if (part.inlineData?.mimeType && part.inlineData?.data) {
            if (this.isSupportedAnthropicImageMimeType(part.inlineData.mimeType)) {
                return {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: part.inlineData.mimeType,
                        data: part.inlineData.data,
                    },
                };
            }
            if (part.inlineData.mimeType === 'application/pdf') {
                return {
                    type: 'document',
                    source: {
                        type: 'base64',
                        media_type: 'application/pdf',
                        data: part.inlineData.data,
                    },
                };
            }
            const displayName = part.inlineData.displayName
                ? ` (${part.inlineData.displayName})`
                : '';
            return {
                type: 'text',
                text: `Unsupported inline media type: ${part.inlineData.mimeType}${displayName}.`,
            };
        }
        if (part.fileData?.mimeType && part.fileData?.fileUri) {
            const displayName = part.fileData.displayName
                ? ` (${part.fileData.displayName})`
                : '';
            const fileUri = part.fileData.fileUri;
            if (this.isSupportedAnthropicImageMimeType(part.fileData.mimeType)) {
                return {
                    type: 'image',
                    source: {
                        type: 'url',
                        url: fileUri,
                    },
                };
            }
            if (part.fileData.mimeType === 'application/pdf') {
                return {
                    type: 'document',
                    source: {
                        type: 'url',
                        url: fileUri,
                    },
                };
            }
            return {
                type: 'text',
                text: `Unsupported file media type: ${part.fileData.mimeType}${displayName}.`,
            };
        }
        return null;
    }
    isSupportedAnthropicImageMimeType(mimeType) {
        return (mimeType === 'image/jpeg' ||
            mimeType === 'image/png' ||
            mimeType === 'image/gif' ||
            mimeType === 'image/webp');
    }
    extractTextFromContentUnion(contentUnion) {
        if (typeof contentUnion === 'string') {
            return contentUnion;
        }
        if (Array.isArray(contentUnion)) {
            return contentUnion
                .map((item) => this.extractTextFromContentUnion(item))
                .filter(Boolean)
                .join('\n');
        }
        if (typeof contentUnion === 'object' && contentUnion !== null) {
            if ('parts' in contentUnion) {
                const content = contentUnion;
                return (content.parts
                    ?.map((part) => {
                    if (typeof part === 'string')
                        return part;
                    if ('text' in part)
                        return part.text || '';
                    return '';
                })
                    .filter(Boolean)
                    .join('\n') || '');
            }
        }
        return '';
    }
    extractFunctionResponseContent(response) {
        if (response === null || response === undefined) {
            return '';
        }
        if (typeof response === 'string') {
            return response;
        }
        if (typeof response === 'object') {
            const responseObject = response;
            const output = responseObject['output'];
            if (typeof output === 'string') {
                return output;
            }
            const error = responseObject['error'];
            if (typeof error === 'string') {
                return error;
            }
        }
        try {
            const serialized = JSON.stringify(response);
            return serialized ?? String(response);
        }
        catch {
            return String(response);
        }
    }
    safeInputToArgs(input) {
        if (input && typeof input === 'object') {
            return input;
        }
        if (typeof input === 'string') {
            return safeJsonParse(input, {});
        }
        return {};
    }
    mapAnthropicFinishReasonToGemini(reason) {
        if (!reason)
            return undefined;
        const mapping = {
            end_turn: FinishReason.STOP,
            stop_sequence: FinishReason.STOP,
            tool_use: FinishReason.STOP,
            max_tokens: FinishReason.MAX_TOKENS,
            content_filter: FinishReason.SAFETY,
        };
        return mapping[reason] || FinishReason.FINISH_REASON_UNSPECIFIED;
    }
    isContentObject(content) {
        return (typeof content === 'object' &&
            content !== null &&
            'role' in content &&
            'parts' in content &&
            Array.isArray(content['parts']));
    }
    /**
     * Resolve the effective {@link CacheRetention} for one cache anchor,
     * normalized so retention is monotonically non-increasing in wire order.
     *
     * Render order is `tools` -> `system` -> `messages`, so this converter's
     * three anchors sit on the wire in exactly that order: `tool` -> `system`
     * -> `user.last`. Anthropic requires "cache entries with longer TTL must
     * appear before shorter TTLs" — an anchor at the spec's 5-minute default
     * (no `ttl`) is a short-TTL entry for this rule's purposes, so a raw
     * per-anchor override like `cacheRetentionByBlock: { system: '1h' }`
     * would otherwise leave the (still 5m-default) `tool` anchor ahead of a
     * 1h `system` anchor on the wire — an ordering violation Anthropic 400s
     * on.
     *
     * Resolving with a scan instead of a straight per-anchor lookup avoids
     * that: `anchor` resolves to `'1h'` if `anchor` itself OR any anchor
     * later on the wire resolves to `'1h'`. That makes every
     * `cacheRetentionByBlock` configuration legal — anchors before a `'1h'`
     * anchor are promoted to `'1h'` too — without adding a new error surface
     * or rejecting any input. `{ tool: '1h' }` alone is unaffected (nothing
     * follows it that needs promoting); `{ system: '1h' }` alone now also
     * promotes `tool` to `'1h'`, which is exactly the "cache my big system
     * prompt for an hour" usage the per-anchor override exists for.
     */
    resolveCacheRetention(anchor, cacheRetention, cacheRetentionByBlock) {
        const wireOrder = [
            'tool',
            'system',
            'user.last',
        ];
        const anchorIndex = wireOrder.indexOf(anchor);
        for (let i = wireOrder.length - 1; i >= anchorIndex; i--) {
            if ((cacheRetentionByBlock[wireOrder[i]] ?? cacheRetention) === '1h') {
                return '1h';
            }
        }
        return 'ephemeral';
    }
    /**
     * Build system content blocks with cache_control.
     * Anthropic prompt caching requires cache_control on system content.
     * When `useGlobalCacheScope` is set, attach `scope: 'global'` so the
     * system prefix participates in cross-session caching under the
     * `prompt-caching-scope-2026-01-05` beta. Otherwise emit the standard
     * per-session shape so non-Anthropic baseURLs aren't sent a scope
     * extension they may not recognize.
     *
     * When `staticSystemPrefix` matches the beginning of the system text and
     * a suffix follows (git status, session-start context — the volatile
     * tails the client appends after the stable prompt), the text is split
     * into two blocks carrying one breakpoint each:
     *   1. the stable prefix — scoped per `useGlobalCacheScope`, so new
     *      sessions reuse it even though their suffix differs;
     *   2. the end of the full system prompt — always the per-session
     *      `{ type: 'ephemeral' }` shape. The suffix varies across sessions,
     *      so a global-scope entry here would churn cache for zero hits
     *      (same reasoning as `addCacheControlToMessages`). Within a session
     *      it still caches the suffix, and when the suffix changes mid-session
     *      (/cd refreshes git status, session-start context lands) the prefix
     *      breakpoint keeps the big block from re-billing.
     * The split only shapes the outgoing request; stored history and
     * non-Anthropic transports keep seeing a single system string.
     */
    buildSystemWithCacheControl(systemText, useGlobalCacheScope, staticSystemPrefix, cacheRetention = 'ephemeral') {
        if (!systemText) {
            return systemText;
        }
        const scopedCacheControl = {
            type: 'ephemeral',
            ...(useGlobalCacheScope ? { scope: 'global' } : {}),
            ...(cacheRetention === '1h' ? { ttl: '1h' } : {}),
        };
        if (staticSystemPrefix &&
            systemText.length > staticSystemPrefix.length &&
            systemText.startsWith(staticSystemPrefix)) {
            return [
                {
                    type: 'text',
                    text: staticSystemPrefix,
                    cache_control: scopedCacheControl,
                },
                {
                    type: 'text',
                    text: systemText.slice(staticSystemPrefix.length),
                    // Deliberately never carries `scope: 'global'` (see class doc
                    // above — the suffix varies per session, cross-session reuse
                    // has ~zero hit rate). `cacheRetention` still applies: the
                    // suffix is cached within a session, and a caller that asked
                    // for the 1h tier benefits from it surviving longer gaps
                    // between turns even on this volatile block.
                    cache_control: {
                        type: 'ephemeral',
                        ...(cacheRetention === '1h' ? { ttl: '1h' } : {}),
                    },
                },
            ];
        }
        return [
            {
                type: 'text',
                text: systemText,
                cache_control: scopedCacheControl,
            },
        ];
    }
    /**
     * Remove thinking and redacted_thinking blocks from assistant messages.
     * Used by DeepSeek when thinking mode is off but session history still
     * has `thought: true` parts — keeps the request body in sync with the
     * absent top-level `thinking` config.
     *
     * If stripping would leave an assistant message with no content blocks
     * (a thinking-only turn, e.g. one cut off by max_tokens before any text
     * or tool_use was emitted), we keep the original blocks. An empty
     * `content: []` is rejected by the Anthropic API, and dropping the
     * message would break the required user/assistant alternation. DeepSeek
     * empirically tolerates the residual `thinking-block + no-thinking-config`
     * shape (verified against api.deepseek.com/anthropic), so leaving it as
     * an unaltered passthrough is the safer fallback.
     */
    stripThinkingFromAssistantMessages(messages) {
        for (const message of messages) {
            if (message.role !== 'assistant')
                continue;
            if (!Array.isArray(message.content))
                continue;
            const filtered = message.content.filter((block) => {
                const t = block.type;
                return t !== 'thinking' && t !== 'redacted_thinking';
            });
            if (filtered.length === 0)
                continue;
            if (filtered.length !== message.content.length) {
                message.content = filtered;
            }
        }
    }
    /**
     * Fill in `signature: ''` on every assistant `thinking` block that lacks
     * a `signature` field. Preserves the original thinking text. Common cases:
     *
     * - Cross-provider history where the upstream generator (OpenAI / Gemini /
     *   agent-runtime) only set `thought: true` without a signature.
     * - `redacted_thinking` blocks whose `data` field didn't survive the
     *   round-trip through Gemini Part format.
     *
     * DeepSeek empirically accepts empty signatures, so this keeps the wire
     * shape spec-compliant without discarding any preserved thinking text.
     */
    fillMissingThinkingSignatures(messages) {
        for (const message of messages) {
            if (message.role !== 'assistant')
                continue;
            if (!Array.isArray(message.content))
                continue;
            let modified = false;
            const normalized = message.content.map((block) => {
                const b = block;
                if (b.type === 'thinking' && typeof b.signature !== 'string') {
                    modified = true;
                    return {
                        ...block,
                        signature: '',
                    };
                }
                return block;
            });
            if (modified) {
                message.content = normalized;
            }
        }
    }
    dropUnsignedThinkingFromAssistantMessages(messages) {
        const cleaned = [];
        const isUnsignedThinking = (block) => {
            const value = block;
            return (value.type === 'thinking' &&
                (typeof value.signature !== 'string' || value.signature.length === 0));
        };
        const hasBlockType = (message, type) => Array.isArray(message.content) &&
            message.content.some((block) => block.type === type);
        const activeToolUseTurns = new Set();
        let cursor = messages.length - 1;
        while (cursor >= 0) {
            let hasToolResult = false;
            while (cursor >= 0 && messages[cursor]?.role === 'user') {
                hasToolResult ||= hasBlockType(messages[cursor], 'tool_result');
                cursor--;
            }
            const assistant = messages[cursor];
            if (!hasToolResult ||
                !assistant ||
                assistant.role !== 'assistant' ||
                !hasBlockType(assistant, 'tool_use')) {
                break;
            }
            activeToolUseTurns.add(cursor);
            cursor--;
        }
        for (const [index, message] of messages.entries()) {
            if (message.role !== 'assistant' || !Array.isArray(message.content)) {
                cleaned.push(message);
                continue;
            }
            if (!message.content.some(isUnsignedThinking)) {
                cleaned.push(message);
                continue;
            }
            if (activeToolUseTurns.has(index)) {
                throw new Error('Anthropic-compatible proxy omitted the thinking signature for a ' +
                    'tool-use turn that is still in progress. Configure the proxy to ' +
                    'preserve thinking signatures, or start a new session with ' +
                    'reasoning disabled.');
            }
            const filtered = message.content.filter((block) => !isUnsignedThinking(block));
            if (filtered.length > 0) {
                cleaned.push({ ...message, content: filtered });
            }
        }
        return cleaned;
    }
    /**
     * DeepSeek's anthropic-compatible API rejects follow-up requests when an
     * assistant turn carrying `tool_use` omits a thinking block while thinking
     * mode is on, returning HTTP 400 ("The content[].thinking in the thinking
     * mode must be passed back to the API."). The model can legitimately
     * return a tool round without thinking content, so prepend a synthetic
     * empty thinking block when one is missing.
     *
     * Live verification against api.deepseek.com/anthropic confirmed the
     * trigger is specific to tool_use turns — plain-text assistant turns
     * without thinking are accepted unchanged. We mirror that boundary here
     * to avoid bloating replay history with synthetic blocks for turns the
     * API already accepts.
     *
     * Should be paired with `fillMissingThinkingSignatures` running first
     * so that signature-less `thinking` blocks become compliant in place
     * (preserving their original text), and this pass then sees them as
     * already-satisfying. https://github.com/LailatulCoder/lailatul-coder/issues/3786
     */
    injectEmptyThinkingOnToolUseTurns(messages) {
        for (const message of messages) {
            if (message.role !== 'assistant')
                continue;
            if (!Array.isArray(message.content))
                continue;
            const blocks = message.content;
            const hasToolUse = blocks.some((block) => block.type === 'tool_use');
            if (!hasToolUse)
                continue;
            const hasThinking = blocks.some((block) => {
                const t = block.type;
                return t === 'thinking' || t === 'redacted_thinking';
            });
            if (hasThinking)
                continue;
            // DeepSeek currently accepts an empty `signature` for synthetic
            // thinking blocks. The `signature` field is an opaque token in the
            // Anthropic spec, so this is a workaround — if DeepSeek tightens
            // validation in the future, we may need to switch to
            // `redacted_thinking` or another approach.
            const emptyThinking = {
                type: 'thinking',
                thinking: '',
                signature: '',
            };
            message.content = [emptyThinking, ...blocks];
        }
    }
    /**
     * Strip a trailing empty-content assistant message, or append a
     * synthetic user turn to satisfy Anthropic's "must end with a user
     * message" requirement (Opus/Sonnet 4.6+, every 5.x family) when the
     * conversation would otherwise end on a non-empty assistant message.
     * See {@link ConvertGeminiRequestToAnthropicOptions.stripTrailingAssistantPrefill}.
     */
    stripTrailingAssistantPrefill(messages) {
        // Phase 1: drop genuinely empty trailing assistant messages (no real
        // content — a leftover prefill artifact from history trimming/replay).
        while (messages.length > 0) {
            const last = messages[messages.length - 1];
            if (last.role !== 'assistant')
                return;
            if (!this.isEmptyAssistantMessage(last))
                break;
            messages.pop();
        }
        // Phase 2: a real-content assistant message is still trailing — keep
        // it in history (it may carry tool_use/thinking the model needs to see
        // again) and append a synthetic user turn instead of dropping it.
        if (messages.length > 0 &&
            messages[messages.length - 1].role === 'assistant') {
            messages.push({
                role: 'user',
                content: [{ type: 'text', text: 'Continue.' }],
            });
        }
    }
    isEmptyAssistantMessage(message) {
        const content = message.content;
        if (!content)
            return true;
        if (typeof content === 'string')
            return content.trim().length === 0;
        if (!Array.isArray(content) || content.length === 0)
            return true;
        for (const block of content) {
            const type = block.type;
            if (type === 'text') {
                const text = block.text;
                if (typeof text === 'string' && text.trim().length > 0)
                    return false;
            }
            else {
                // Any non-text block (tool_use, thinking, etc.) is real content.
                return false;
            }
        }
        return true;
    }
    /**
     * Add cache_control to the last user message's content.
     * This enables prompt caching for the conversation context.
     *
     * Deliberately emits the per-session `{ type: 'ephemeral' }` shape only —
     * no `scope: 'global'`. The last user message changes every turn (it's
     * the live prompt and any tool_result blocks from the immediately prior
     * round), so cross-session reuse here has effectively zero hit rate and
     * paying the global-scope overhead would just churn cache. The static
     * system prefix and tool prefixes (which DO repeat across sessions) carry
     * `scope: 'global'` instead.
     */
    addCacheControlToMessages(messages, cacheRetention = 'ephemeral') {
        // Find the last user message to add cache_control. The Anthropic docs
        // (https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
        // explicitly list both `text` and `tool_result` blocks as cacheable in
        // `messages.content`. In agentic loops the last user message after
        // turn 1 is typically a tool_result-only message, so accepting both
        // types keeps the per-turn breakpoint moving forward as the
        // conversation grows (otherwise the cacheable region collapses back
        // to system+tools and turn-over-turn history never gets cached).
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'user') {
                const content = Array.isArray(msg.content)
                    ? msg.content
                    : [{ type: 'text', text: msg.content }];
                if (content.length > 0) {
                    const lastContent = content[content.length - 1];
                    if (typeof lastContent === 'object' && 'type' in lastContent) {
                        const type = lastContent.type;
                        // Empty text blocks cannot be cached (per Anthropic docs).
                        const isEmptyText = type === 'text' &&
                            (!('text' in lastContent) || !lastContent.text);
                        if ((type === 'text' || type === 'tool_result') && !isEmptyText) {
                            lastContent.cache_control = {
                                type: 'ephemeral',
                                ...(cacheRetention === '1h' ? { ttl: '1h' } : {}),
                            };
                        }
                    }
                    msg.content = content;
                }
                break;
            }
        }
    }
}
/**
 * Merge consecutive assistant messages into a single message.
 *
 * When the Gemini history has consecutive model turns (e.g. from streaming
 * chunk-level recording, max_tokens recovery, or adaptive thinking splits),
 * processContent emits one Anthropic message per Content. The Anthropic API
 * requires that tool_use blocks be immediately followed by tool_result
 * blocks in the next message — consecutive assistant messages break this
 * pairing and cause HTTP 400 "tool_use ids were found without tool_result
 * blocks immediately after".
 *
 * Thinking blocks must come first in Anthropic's content array, so merged
 * blocks are reordered: all thinking blocks (from both messages) precede
 * non-thinking blocks (text, tool_use, etc.).
 *
 * Mirrors the same-name function in the OpenAI converter.
 */
function mergeConsecutiveAssistantMessages(messages) {
    const merged = [];
    for (const message of messages) {
        if (message.role === 'assistant' &&
            merged.length > 0 &&
            Array.isArray(message.content)) {
            const lastMessage = merged[merged.length - 1];
            if (lastMessage.role === 'assistant' &&
                Array.isArray(lastMessage.content)) {
                const lastBlocks = lastMessage.content;
                const currentBlocks = message.content;
                const isThinking = (b) => {
                    const t = b.type;
                    return t === 'thinking' || t === 'redacted_thinking';
                };
                const seenToolUseIds = new Set();
                const combined = [
                    ...lastBlocks.filter(isThinking),
                    ...currentBlocks.filter(isThinking),
                    ...lastBlocks.filter((b) => !isThinking(b)),
                    ...currentBlocks.filter((b) => !isThinking(b)),
                ].filter((b) => {
                    const t = b.type;
                    if (t === 'tool_use') {
                        const id = b.id;
                        if (id) {
                            if (seenToolUseIds.has(id))
                                return false;
                            seenToolUseIds.add(id);
                        }
                    }
                    return true;
                });
                lastMessage.content = combined;
                continue;
            }
        }
        merged.push(message);
    }
    return merged;
}
/**
 * Builds a first-wins predicate for deduplicating tool_result blocks by
 * tool_use_id. Anthropic rejects a message with more than one tool_result
 * for the same tool_use_id ("each `tool_use` block must have a single
 * result" -- HTTP 400); a duplicate can happen when a tool call's result is
 * recorded twice in history (a retried conversion pass, or a history source
 * that double-appends a function response). In the cases observed so far
 * the duplicate blocks are byte-identical, so first-wins vs. last-wins is
 * indistinguishable in practice -- first-wins is chosen only because it
 * requires no lookahead. id-less blocks always pass through unfiltered,
 * preserving prior behavior for blocks Anthropic doesn't validate this way.
 *
 * Two independent call sites need this: `cleanOrphanedToolCalls` (the
 * common case, a duplicate within one message) and
 * `mergeConsecutiveUserMessages` (a duplicate that only becomes
 * co-located after two originally-separate messages are combined).
 */
function makeToolResultDeduper() {
    const seen = new Set();
    return (id) => {
        if (!id)
            return true;
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    };
}
/**
 * Remove tool_use blocks that have no matching tool_result in the
 * immediately following user message, and remove tool_result blocks that
 * have no matching tool_use in the immediately preceding assistant message.
 * Also cascade-strips `thinking`/`redacted_thinking` blocks from an
 * assistant turn whenever a `tool_use` is removed from that same turn by
 * this pass AND no other `tool_use` survives in it -- the signature on
 * those blocks was computed over content that included the now-removed
 * `tool_use`, so replaying it produces Anthropic 400 "thinking blocks in
 * the latest assistant message cannot be modified". The model regenerates
 * thinking on its next turn regardless. Scoped to "no surviving tool_use"
 * rather than "any tool_use removed": a turn with `[thinking, tool_use A,
 * tool_use B]` where only B is a genuine orphan still sends A on the wire,
 * and per Anthropic's manual-mode extended-thinking contract the final
 * assistant turn of a thinking-enabled request must begin with a thinking
 * block when any `tool_use` remains in it -- stripping the thinking here
 * would trade one 400 for another.
 *
 * A `tool_use` in the very last message (no message follows it at all) is
 * never condemned as orphaned here -- "no result yet" isn't the same as
 * "no result ever": the tool may simply not have finished executing yet,
 * or this conversion may not be building the completed turn to send to
 * Anthropic at all (token counting, a resumed/replayed session snapshot,
 * a retry issued before tool execution completes, ...). Only a `tool_use`
 * whose subsequent message was actually scanned and found lacking a
 * matching `tool_result` is a genuine orphan.
 *
 * Empty messages produced by the cleanup are dropped entirely. A subsequent
 * mergeConsecutiveAssistantMessages call fixes alternation issues created
 * by a dropped assistant message sandwiched between two other assistant
 * messages; mergeConsecutiveUserMessages (later in the pipeline) does the
 * same when the sandwiching messages are user turns instead.
 *
 * Mirrors the same-name function in the OpenAI converter.
 */
function cleanOrphanedToolCalls(messages) {
    const validToolUseBlocks = new WeakSet();
    const validToolResultBlocks = new WeakSet();
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.role !== 'assistant' || !Array.isArray(message.content)) {
            continue;
        }
        const blocks = message.content;
        const toolUseBlocks = new Map();
        for (const block of blocks) {
            if (block.type === 'tool_use') {
                const id = block.id;
                if (id && !toolUseBlocks.has(id))
                    toolUseBlocks.set(id, block);
            }
        }
        if (toolUseBlocks.size === 0)
            continue;
        // No message follows this assistant turn at all -- these tool_use
        // blocks are unresolved (the tool hasn't finished executing yet, or
        // this conversion isn't building the completed turn for Anthropic at
        // all, e.g. a token-count pass or a mid-tool-call snapshot), not
        // orphaned. Protect them from the filter below. A genuine orphan
        // requires a subsequent message that was actually scanned and found
        // to lack a matching tool_result -- "history ends here" is not that.
        if (i === messages.length - 1) {
            for (const block of toolUseBlocks.values()) {
                validToolUseBlocks.add(block);
            }
            continue;
        }
        for (let j = i + 1; j < messages.length; j++) {
            const nextMessage = messages[j];
            if (!nextMessage ||
                nextMessage.role !== 'user' ||
                !Array.isArray(nextMessage.content)) {
                break;
            }
            let seenNonToolResult = false;
            for (const block of nextMessage.content) {
                if (block.type === 'tool_result') {
                    const id = block.tool_use_id;
                    const toolUseBlock = id ? toolUseBlocks.get(id) : undefined;
                    if (!seenNonToolResult && toolUseBlock) {
                        validToolUseBlocks.add(toolUseBlock);
                        validToolResultBlocks.add(block);
                    }
                }
                else {
                    seenNonToolResult = true;
                }
            }
        }
    }
    const cleaned = [];
    for (const message of messages) {
        if (!Array.isArray(message.content)) {
            cleaned.push(message);
            continue;
        }
        const blocks = message.content;
        const hasToolUse = blocks.some((b) => b.type === 'tool_use');
        const hasToolResult = blocks.some((b) => b.type === 'tool_result');
        if (!hasToolUse && !hasToolResult) {
            cleaned.push(message);
            continue;
        }
        let toolUseRemoved = false;
        const keepToolResult = makeToolResultDeduper();
        const filtered = blocks.filter((b) => {
            const t = b.type;
            if (t === 'tool_use') {
                const id = b.id;
                const keep = !id || validToolUseBlocks.has(b);
                if (!keep)
                    toolUseRemoved = true;
                return keep;
            }
            if (t === 'tool_result') {
                const id = b.tool_use_id;
                if (!id)
                    return true;
                if (!validToolResultBlocks.has(b))
                    return false;
                return keepToolResult(id);
            }
            return true;
        });
        // A tool_use was stripped from this turn and none survives -- any
        // thinking/redacted_thinking sibling in the same turn is now
        // untrustworthy (see function doc). If a tool_use survives, the
        // thinking sibling is left in place: it's still needed to satisfy
        // Anthropic's manual-mode "final turn must begin with thinking when a
        // tool_use is present" rule, and only cascading on total removal keeps
        // this narrower than a blanket "any removal" rule. tool_use/thinking
        // only ever co-occur on assistant messages, but the role check is
        // defensive.
        const survivingToolUse = filtered.some((b) => b.type === 'tool_use');
        const finalBlocks = toolUseRemoved && !survivingToolUse && message.role === 'assistant'
            ? filtered.filter((b) => {
                const t = b.type;
                return t !== 'thinking' && t !== 'redacted_thinking';
            })
            : filtered;
        if (finalBlocks.length > 0) {
            cleaned.push({ ...message, content: finalBlocks });
        }
        else {
            debugLogger.debug('cleanOrphanedToolCalls: dropping message with only orphaned tool blocks');
        }
    }
    return cleaned;
}
/**
 * Drops any `thinking` block with empty text from a non-latest assistant
 * turn (dropping the whole message if that empties it out). An Anthropic
 * `thinking` block's signature is computed over its own text content; a
 * block with no text at all cannot represent valid signed reasoning
 * regardless of whether a signature is present. This arises when a
 * `redacted_thinking` block -- whose opaque `data` doesn't survive the
 * Gemini-`Part` round trip, see
 * {@link AnthropicContentConverter.convertAnthropicResponseToGemini} --
 * is replayed back through history construction as an empty-text
 * `thinking` block.
 *
 * Scoped to non-latest assistant turns, matching Anthropic's contract that
 * the latest assistant turn's signatures must replay byte-exact.
 *
 * This was originally one guard inside a larger `pruneUntrustworthyThinking`
 * pass that also tried to detect and downgrade a non-latest, thinking-only
 * turn whose `tool_use` had gone stale in an earlier trim (a cross-turn
 * complement to {@link cleanOrphanedToolCalls}'s same-turn cascade). That
 * broader heuristic was removed after review: it could not distinguish "this
 * turn's tool_use was removed by an earlier trim" from "this turn was
 * always thinking-only" (both are structurally identical by the time it
 * ran), it ran before the passes that already handle unsigned thinking
 * correctly (reordering caused them to stop recognizing thinking it had
 * already re-typed as text), its DeepSeek exclusion only covered one of
 * DeepSeek's two thinking modes, and live A/B verification against a real
 * session showed it re-typing a thinking-only turn on the very next
 * request just because a newer assistant turn had been appended --
 * invalidating a cache breakpoint and adding token cost for content that
 * was never actually invalid. Investigation into this codebase's actual
 * compaction (`chatCompressionService` is full-history, not a partial
 * trim that could strand a `tool_use`) and orphan-repair
 * (`repairOrphanedToolUseTurns` already synthesizes an error
 * `tool_result` for a genuine cross-turn orphan before it would reach this
 * pass) did not reproduce the state the broader heuristic existed to
 * clean up. This guard is the one part of that pass that is unconditionally
 * correct regardless of that heuristic's premise, so it's kept on its own.
 */
function dropEmptyTextThinkingBlocks(messages) {
    let latestAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
            latestAssistantIdx = i;
            break;
        }
    }
    const out = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
            out.push(msg);
            continue;
        }
        if (i === latestAssistantIdx) {
            out.push(msg);
            continue;
        }
        const blocks = msg.content;
        const filtered = blocks.filter((raw) => {
            const bType = raw.type;
            const bThinkingRaw = raw.thinking;
            const bThinking = typeof bThinkingRaw === 'string' ? bThinkingRaw : undefined;
            return !(bType === 'thinking' &&
                (bThinking === undefined || bThinking.length === 0));
        });
        if (filtered.length === 0)
            continue;
        out.push({ role: msg.role, content: filtered });
    }
    return out;
}
function mergeConsecutiveUserMessages(messages) {
    const merged = [];
    for (const message of messages) {
        const lastMessage = merged[merged.length - 1];
        if (message.role === 'user' &&
            lastMessage?.role === 'user' &&
            Array.isArray(message.content) &&
            Array.isArray(lastMessage.content)) {
            const combined = [
                ...lastMessage.content,
                ...message.content,
            ];
            // Two originally-separate user messages can each carry a valid
            // tool_result for the same tool_use_id (cleanOrphanedToolCalls only
            // dedupes within a single message, before this merge combines
            // several into one). Re-apply the same first-wins dedup here so a
            // cross-message duplicate can't survive the merge and reach the
            // wire as two tool_result blocks for one tool_use_id.
            const keepToolResult = makeToolResultDeduper();
            const toolResults = combined.filter((b) => {
                if (b.type !== 'tool_result')
                    return false;
                const id = b.tool_use_id;
                return keepToolResult(id);
            });
            lastMessage.content = [
                ...toolResults,
                ...combined.filter((b) => b.type !== 'tool_result'),
            ];
            continue;
        }
        merged.push(message);
    }
    return merged;
}
//# sourceMappingURL=converter.js.map