/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Contextual tip registry — defines tips, their conditions, and display rules.
 */
import { type CompactionThresholds } from '@lailatul-coder/lailatul-coder-core';
export type TipTrigger = 'startup' | 'post-response';
export interface TipContext {
    lastPromptTokenCount: number;
    contextWindowSize: number;
    sessionPromptCount: number;
    sessionCount: number;
    platform: string;
    /**
     * Three-tier auto-compaction thresholds, computed by callers via
     * `computeThresholds(contextWindowSize)`. Optional for backward compat;
     * context-* tip checks return false when missing.
     */
    thresholds?: CompactionThresholds;
}
export interface ContextualTip {
    id: string;
    content: string;
    trigger: TipTrigger;
    isRelevant: (ctx: TipContext) => boolean;
    cooldownPrompts: number;
    priority: number;
}
export declare const tipRegistry: ContextualTip[];
