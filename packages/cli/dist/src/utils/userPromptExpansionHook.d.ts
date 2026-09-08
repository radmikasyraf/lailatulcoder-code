/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PartListUnion } from '@google/genai';
export declare function appendUserPromptExpansionAdditionalContext(content: PartListUnion, additionalContext: string | undefined): PartListUnion;
export declare function serializeUserPromptExpansionPrompt(content: PartListUnion): string;
export declare function formatUserPromptExpansionBlockedMessage(reason: string): string;
