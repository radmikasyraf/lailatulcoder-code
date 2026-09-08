/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@lailatul-coder/lailatul-coder-core';
/**
 * Refine a raw ASR transcript with the fast model before it lands in the
 * prompt. Best-effort and never throws: on timeout, error, abort, or an empty
 * result it resolves to the original `raw` so voice input always produces text.
 */
export declare function refineVoiceTranscript(config: Config, raw: string, signal: AbortSignal): Promise<string>;
