/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part } from '@google/genai';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
/**
 * Cap injected resource text so a misbehaving/hostile MCP server can't blow the
 * context window (files are capped by readManyFiles; resource content was
 * previously uncapped).
 */
export declare const MAX_MCP_RESOURCE_TEXT_CHARS = 100000;
/** Cap CUMULATIVE base64 blob payload per resource (~6 MB binary). */
export declare const MAX_MCP_RESOURCE_BLOB_CHARS = 8000000;
export interface FormattedMcpResource {
    /**
     * Content parts framed with attribution delimiters, or `[]` when the read
     * yielded no text/blob content. Inject (or return as `llmContent`) verbatim.
     */
    parts: Part[];
    /** Total text chars actually injected (after capping). */
    textChars: number;
    /** Number of blob attachments actually injected (after capping). */
    blobCount: number;
    /** Total base64 blob chars actually injected (after capping). */
    blobChars: number;
    /** True when any text/blob content was dropped or sliced by a cap. */
    truncated: boolean;
}
/** Options for {@link formatMcpResourceContents}. */
export interface FormatMcpResourceOptions {
    /**
     * Max cumulative base64 blob chars this call may inject. Defaults to
     * {@link MAX_MCP_RESOURCE_BLOB_CHARS}. The `read_mcp_resource` tool lowers
     * this to the remaining per-turn budget so many parallel calls can't inject
     * an unbounded total (see its per-turn blob budget).
     */
    maxBlobChars?: number;
}
/**
 * Turn a raw MCP `resources/read` result into model-ready parts. Shared by the
 * `@server:uri` injection path and the `read_mcp_resource` tool so the two
 * can't drift.
 *
 * Text is capped at {@link MAX_MCP_RESOURCE_TEXT_CHARS}, cumulative blob payload
 * at {@link MAX_MCP_RESOURCE_BLOB_CHARS} (a server returning many sub-limit
 * blobs in one response could otherwise still inject unbounded data); blobs
 * become `inlineData` media parts rather than raw base64 text. The returned
 * `parts` are wrapped in `--- Content from MCP resource <label> [<nonce>] ---
 * ... --- End of MCP resource <label> [<nonce>] ---` delimiters, which bound
 * the model's view of untrusted server content. The per-call random `<nonce>`
 * makes the closing marker unforgeable: a hostile server cannot embed a fake
 * `--- End of MCP resource <label> ---` in its own content to smuggle text out
 * of the frame, since it cannot predict the nonce.
 */
export declare function formatMcpResourceContents(result: ReadResourceResult, label: string, opts?: FormatMcpResourceOptions): FormattedMcpResource;
/**
 * Model-facing diagnostic injected when a read produced no content parts, so
 * the `@` path and the `read_mcp_resource` tool surface the same attributed
 * explanation instead of diverging (the `@` path would otherwise inject nothing
 * and leave a dangling `@server:uri` reference with no content).
 */
export declare function emptyMcpResourceText(formatted: FormattedMcpResource, label: string): string;
/**
 * One-line summary of what a formatted read actually injected. Used as the `@`
 * resource card's `resultDisplay`, the `read_mcp_resource` tool's
 * `returnDisplay`, and — when no content parts were produced — as the seed of
 * its `llmContent` fallback (see {@link emptyMcpResourceText}), so a success
 * state never hides an empty/truncated read. Keep it display-and-model safe:
 * no ANSI color or markup that would corrupt `llmContent`.
 */
export declare function summarizeMcpResource(formatted: FormattedMcpResource): string;
