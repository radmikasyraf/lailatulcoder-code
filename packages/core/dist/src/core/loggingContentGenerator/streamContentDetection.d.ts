/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenerateContentResponse } from '@google/genai';
/**
 * Detects whether a streaming chunk contains user-visible model output.
 *
 * Used by the LoggingContentGenerator stream wrapper to identify the first
 * chunk that should trigger TTFT (time-to-first-token) measurement.
 *
 * A chunk is "user-visible" if any normalized Part in candidates[0].content.parts
 * is one of:
 *   - text with a non-empty string
 *   - functionCall (tool use — even tool-call-only responses count)
 *   - inlineData (image, binary blob)
 *   - executableCode (sandbox / code-execution responses)
 *   - thought / reasoning content (provider-dependent; o1, qwen thinking, Anthropic <thinking>)
 *
 * Chunks containing only role metadata, only usageMetadata (final summary
 * chunk), or empty parts are NOT user-visible — TTFT should not fire on these.
 *
 * Centralised here (single predicate over the normalized GenerateContentResponse
 * shape) so the four provider generators (Anthropic / OpenAI / Gemini / Qwen)
 * don't each need their own first-token logic. Each provider already normalizes
 * its native chunk shape to GenerateContentResponse before LoggingContentGenerator
 * sees it (see loggingContentGenerator.ts generateContentStream).
 */
export declare function hasUserVisibleContent(chunk: GenerateContentResponse): boolean;
