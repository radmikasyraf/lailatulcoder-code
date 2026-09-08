/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ToolArtifact } from '../tools/tools.js';
export interface ToolResponseBudgetEntry {
    callId: string;
    toolName: string;
    responseParts: Part[];
    persistedOutputFiles?: string[];
    artifacts?: ToolArtifact[];
}
export declare function toolResponseTextLength(parts: Part[]): number;
export declare function enforceFunctionResponseBudget(entries: ToolResponseBudgetEntry[], budget: number): ToolResponseBudgetEntry[];
export declare function finalizeToolResponses(config: Config, entries: ToolResponseBudgetEntry[], promptIds?: ReadonlyMap<string, string>, observeBoundary?: boolean, associateBoundary?: boolean): Promise<ToolResponseBudgetEntry[]>;
