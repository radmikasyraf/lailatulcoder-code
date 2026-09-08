/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import { type ScannedAutoMemoryDocument } from './scan.js';
/**
 * Upper bound on the deterministic fast result. Deliberately far below
 * MAX_RELEVANT_DOCS: this path has no model judgement behind it, so it takes
 * only the highest-scoring documents and leaves the remaining prompt budget
 * to the model-selected result that follows.
 */
export declare const MAX_FAST_RECALL_DOCS = 2;
export declare function selectRelevantAutoMemoryDocuments(query: string, docs: ScannedAutoMemoryDocument[], limit?: number): ScannedAutoMemoryDocument[];
export declare function buildRelevantAutoMemoryPrompt(docs: ScannedAutoMemoryDocument[]): string;
export interface ResolveRelevantAutoMemoryPromptOptions {
    config?: Config;
    excludedFilePaths?: Iterable<string>;
    limit?: number;
    recentTools?: readonly string[];
    /** When provided and aborted, suppresses logMemoryRecall telemetry for discarded results. */
    abortSignal?: AbortSignal;
    /**
     * Invoked with a deterministic, model-free result as soon as the shared
     * scan has produced candidates — before the model selector is called.
     *
     * The model selector is a network side query, so the full result settles in
     * round-trip time. A caller with a short initial-turn budget (see
     * `INITIAL_MEMORY_RECALL_WAIT_MS`) would otherwise have nothing to inject
     * on a turn that makes no tool call, because there is no later safe
     * delivery point on such a turn. This callback reuses the candidates the
     * selector was going to score anyway, so it costs no extra scan or I/O.
     *
     * Fires at most once, never after `abortSignal` aborts, and never when the
     * deterministic pass found nothing.
     */
    onFastResult?: (result: RelevantAutoMemoryPromptResult) => void;
}
export interface RelevantAutoMemoryPromptResult {
    prompt: string;
    selectedDocs: ScannedAutoMemoryDocument[];
    strategy: 'none' | 'heuristic' | 'model';
}
export declare function resolveRelevantAutoMemoryPromptForQuery(projectRoot: string, query: string, options?: ResolveRelevantAutoMemoryPromptOptions): Promise<RelevantAutoMemoryPromptResult>;
export declare function buildRelevantAutoMemoryPromptForQuery(projectRoot: string, query: string, options?: ResolveRelevantAutoMemoryPromptOptions): Promise<string>;
