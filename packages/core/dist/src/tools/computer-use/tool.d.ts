/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, type ToolInvocation, type ToolResult } from '../tools.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PartListUnion } from '@google/genai';
import type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
import { type Config } from '../../config/config.js';
type ComputerUseParams = Record<string, unknown>;
export declare function isHighRiskCall(upstreamName: string, params: Record<string, unknown>): boolean;
export declare class ComputerUseTool extends BaseDeclarativeTool<ComputerUseParams, ToolResult> {
    private readonly upstreamName;
    private readonly config?;
    constructor(upstreamName: ComputerUseToolName, schema: ComputerUseToolSchema, config?: Config | undefined);
    /**
     * Coerce parameter types before schema validation.
     * Models can send the wrong JS type for a field:
     *  - qwen3.6 sends `element_index: 2` (number) but upstream wants "2" (string)
     *  - Some models send `x: "500"` (string) but upstream wants 500 (number)
     * Pre-coercing avoids spurious validation failures without loosening schema types.
     */
    validateToolParams(params: ComputerUseParams): string | null;
    build(params: ComputerUseParams): ToolInvocation<ComputerUseParams, ToolResult>;
    protected createInvocation(params: ComputerUseParams): ToolInvocation<ComputerUseParams, ToolResult>;
}
/**
 * Walk schema properties and coerce values to the type declared by the schema.
 *
 * Direction 1 (string → number): schema says integer/number, model sent a
 * numeric string (e.g. `x: "500"`). Garbage strings are left untouched so
 * they still fail schema validation with a clear error.
 *
 * Direction 2 (number → string): schema says string, model sent a number
 * (e.g. `element_index: 2` when upstream expects `"2"`). Coerce via String().
 */
export declare function coerceTypes(params: Record<string, unknown>, schema: Record<string, unknown>): Record<string, unknown>;
/**
 * @deprecated Use coerceTypes instead. Kept for backward compatibility.
 */
export declare const coerceNumericStrings: typeof coerceTypes;
type RawContentBlock = CallToolResult['content'][number];
/**
 * Converts MCP content blocks to a GenAI PartListUnion.
 * - Text-only results → plain string (preserves existing caller expectations).
 * - Mixed or image/audio results → Part[] so the model can see screenshots.
 */
export declare function buildLlmContent(content: RawContentBlock[], toolName: string, structuredContent?: unknown): PartListUnion;
/**
 * Builds the human-readable display string (text only, no binary data).
 */
export declare function buildDisplayText(content: RawContentBlock[]): string;
/**
 * Serialize a tool result's `structuredContent` for the model, dropping the
 * `tree_markdown` field (get_window_state's AX tree, already present in the
 * `content` text — re-emitting it would roughly double the token cost).
 * Returns undefined when there is nothing useful to forward.
 */
export declare function stringifyStructured(structured: unknown): string | undefined;
export {};
