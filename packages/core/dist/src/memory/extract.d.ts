/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import { type AutoMemoryExtractCursor, type AutoMemoryType } from './types.js';
export interface AutoMemoryExtractResult {
    touchedTopics: AutoMemoryType[];
    skippedReason?: 'already_running' | 'queued' | 'memory_tool' | 'memory_pressure';
    systemMessage?: string;
    cursor: AutoMemoryExtractCursor;
}
export declare function runAutoMemoryExtract(params: {
    projectRoot: string;
    sessionId: string;
    history: Content[];
    now?: Date;
    config?: Config;
}): Promise<AutoMemoryExtractResult>;
