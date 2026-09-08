/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { DefaultOpenAICompatibleProvider } from './default.js';
import { createDebugLogger } from '../../../utils/debugLogger.js';
const debugLogger = createDebugLogger('ZAI');
/**
 * Hostname check for Z.ai / Zhipu GLM endpoints. GLM's OpenAI-compatible
 * chat-completions endpoint takes a flat `reasoning_effort` field (GLM-5.2+),
 * not the nested `reasoning: { effort }` object the OpenAI pipeline passes
 * through by default — see https://docs.z.ai/guides/capabilities/thinking.
 *
 * Hostname-gated so the reshape never leaks to an unrelated strict
 * OpenAI-compatible backend matched only by model name.
 */
export function isZaiHostname(contentGeneratorConfig) {
    const baseUrl = contentGeneratorConfig.baseUrl;
    if (!baseUrl) {
        return false;
    }
    try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        return (hostname === 'z.ai' ||
            hostname.endsWith('.z.ai') ||
            hostname === 'bigmodel.cn' ||
            hostname.endsWith('.bigmodel.cn'));
    }
    catch {
        return false;
    }
}
/**
 * Broader routing check: hostname OR a `glm-*` model name. Only the hostname
 * gate drives the wire reshape (see buildRequest); the model-name fallback just
 * routes obviously-GLM configs through this provider.
 */
export function isZaiProvider(contentGeneratorConfig) {
    if (isZaiHostname(contentGeneratorConfig)) {
        return true;
    }
    const model = contentGeneratorConfig.model ?? '';
    return model.toLowerCase().startsWith('glm-');
}
export class ZaiOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    static isZaiProvider = isZaiProvider;
    static isZaiHostname = isZaiHostname;
    // Latch so the skipped-flatten warning fires once per provider lifetime.
    nonZaiHostnameFlattenWarned = false;
    buildRequest(request, userPromptId) {
        const baseRequest = super.buildRequest(request, userPromptId);
        if (isZaiHostname(this.contentGeneratorConfig)) {
            return flattenReasoningEffort(baseRequest);
        }
        // A `glm-*` model on a non-z.ai/non-bigmodel.cn hostname (e.g. a
        // self-hosted GLM) still routes through this provider via the model-name
        // fallback in `isZaiProvider`, but the GLM-specific `reasoning_effort`
        // reshape stays hostname-gated so we don't push GLM's flat field at an
        // arbitrary OpenAI-compatible backend that may not understand it. Warn once
        // when this leaves a nested `reasoning: { effort }` unflattened so the gap
        // is discoverable in debug logs rather than silent.
        const reasoning = baseRequest['reasoning'];
        if (reasoning?.effort &&
            !baseRequest['reasoning_effort'] &&
            !this.nonZaiHostnameFlattenWarned) {
            debugLogger.warn(`GLM model '${this.contentGeneratorConfig.model ?? 'unknown'}' on a non-Z.ai hostname; leaving nested reasoning.effort='${String(reasoning.effort)}' unflattened (reasoning_effort reshape is hostname-gated).`);
            this.nonZaiHostnameFlattenWarned = true;
        }
        return baseRequest;
    }
}
/**
 * Move the unified nested `reasoning: { effort }` onto GLM's flat
 * `reasoning_effort` field, verbatim. Unlike DeepSeek (whose API only accepts
 * high/max, so its adapter remaps low/medium → high), GLM-5.2 accepts the full
 * ladder (low/medium/high/xhigh/max) and groups low/medium → high and
 * xhigh → max server-side, so we keep the raw tier for fidelity and
 * observability. A user-set top-level `reasoning_effort` (via
 * samplingParams/extra_body) wins and is left untouched.
 */
function flattenReasoningEffort(request) {
    const r = request;
    const nested = r['reasoning'];
    const effort = nested?.effort;
    if (typeof effort !== 'string' || !effort) {
        return request;
    }
    const next = { ...r };
    if (typeof next['reasoning_effort'] !== 'string' ||
        !next['reasoning_effort']) {
        next['reasoning_effort'] = effort;
    }
    // Drop the duplicated nested `effort` so we don't ship two competing knobs;
    // keep any sibling keys (e.g. budget_tokens) the server may honor.
    if (nested && Object.keys(nested).length === 1) {
        delete next['reasoning'];
    }
    else if (nested) {
        const { effort: _drop, ...rest } = nested;
        next['reasoning'] = rest;
    }
    return next;
}
//# sourceMappingURL=zai.js.map