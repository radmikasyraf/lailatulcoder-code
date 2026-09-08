/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part } from '@google/genai';
/**
 * Default ceiling for a single inline media payload (image/audio/blob) sent to
 * the model, measured in decoded bytes. Oversized payloads blow up the request
 * size and token budget, so they are replaced with a text placeholder instead.
 */
export declare const DEFAULT_MAX_INLINE_MEDIA_BYTES: number;
/**
 * Resolve the inline-media byte ceiling, allowing override via the
 * `QWEN_CODE_MAX_INLINE_MEDIA_BYTES` env var. Falls back to the default for
 * missing, non-numeric, non-integer, or non-positive values.
 */
export declare function getMaxInlineMediaBytes(): number;
/**
 * Estimate the decoded byte length of a base64 string without decoding it.
 * Tolerates an optional `data:<mime>;base64,` prefix.
 */
export declare function approxBase64Bytes(base64: string): number;
/**
 * Build the placeholder text substituted for an oversized inline media part.
 */
export declare function oversizedMediaPlaceholder(mimeType: string, bytes: number, limitBytes: number): string;
/**
 * Guard a single Gemini {@link Part}: if it carries inline media larger than
 * `limitBytes`, return a text placeholder part instead; otherwise return the
 * part unchanged. Non-media parts pass through untouched.
 */
export declare function clampInlineMediaPart(part: Part, limitBytes?: number): Part;
