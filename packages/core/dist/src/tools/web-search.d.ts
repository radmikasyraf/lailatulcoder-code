/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FunctionDeclaration } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
/**
 * Parameters for the WebSearch tool. Deliberately just the query: the
 * DashScope Responses API silently ignores every domain-filter shape, and
 * shipping knobs that pretend to work is worse than not having them.
 */
export interface WebSearchToolParams {
    /** The search query. Must be at least 2 characters. */
    query: string;
}
/**
 * Settings for the built-in WebSearch tool as resolved by the CLI config
 * loader (`tools.webSearch` in settings.json merged with the
 * ENABLE_WEB_SEARCH / WEB_SEARCH_* env overrides). Single source of truth
 * for the shape shared by ConfigParameters, Config, and the CLI resolver.
 */
export interface WebSearchSettings {
    enabled?: boolean;
    /** Search model selector, resolved against modelProviders like fastModel. */
    model?: string;
    /** Whether the search agent may open result pages (default true). */
    webExtractor?: boolean;
    /**
     * Env-only backend endpoint (WEB_SEARCH_BASE_URL). When set, it takes
     * precedence over modelProviders resolution and `model` is used as the
     * plain DashScope model id.
     */
    baseUrl?: string;
    /** Env var name holding the API key for the env-declared backend. */
    apiKeyEnv?: string;
}
/** Resolved backend configuration for the search side request. */
export interface WebSearchBackendConfig {
    modelId: string;
    /** Environment variable name holding the API key. */
    apiKeyEnvKey: string;
    baseUrl: string;
    /** Whether the search agent may open result pages (web_extractor). */
    webExtractor: boolean;
    /**
     * Custom headers from the entry's generationConfig — internal gateways
     * accepted by the baseUrl check may require routing/auth headers.
     */
    customHeaders?: Record<string, string>;
}
export type WebSearchGateResult = {
    ok: true;
    backend: WebSearchBackendConfig;
} | {
    ok: false;
    notice: string;
};
/**
 * Evaluate whether WebSearch can run with the current configuration.
 *
 * Called at registry-build time (register the tool or surface a startup
 * notice) and re-checked per invocation. There is deliberately no
 * client-side model allowlist: the documented supported-model list is not
 * enforced server-side and already lags reality, while a model the Responses
 * endpoint does not serve fails the first invocation loudly
 * (`InvalidParameter: Unsupported model`).
 */
export declare function evaluateWebSearchGate(config: Config): WebSearchGateResult;
export declare class WebSearchTool extends BaseDeclarativeTool<WebSearchToolParams, ToolResult> {
    private readonly config;
    static readonly Name: string;
    get maxOutputChars(): number;
    constructor(config: Config);
    /**
     * The description embeds the current month; recompute it on schema access
     * so a long-lived process (qwen serve, the ACP bridge) crossing a month
     * boundary does not pin search queries to a stale year. Within a month the
     * string is identical, preserving prompt-cache stability.
     */
    get schema(): FunctionDeclaration;
    protected validateToolParamValues(params: WebSearchToolParams): string | null;
    protected createInvocation(params: WebSearchToolParams): ToolInvocation<WebSearchToolParams, ToolResult>;
    toAutoClassifierInput(params: WebSearchToolParams): Record<string, unknown>;
}
