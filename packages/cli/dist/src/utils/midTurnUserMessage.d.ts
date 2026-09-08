/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part, PartListUnion } from '@google/genai';
export declare const MID_TURN_USER_MESSAGE_PREFIX = "\n[User message received during tool execution]: ";
export declare function prefixMidTurnUserMessageParts(parts: PartListUnion, displayText: string): Part[];
