/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * True when `text` contains `workflow` as a standalone word (case-insensitive).
 * Tokenizes on whitespace and strips edge punctuation, so `Workflow` and
 * `a workflow.` match while `workflows`, `dataflow`, and `my-workflow-runner`
 * do not — a stricter notion of "word" than `\bworkflow\b` (which treats
 * hyphens as boundaries and would over-match compound identifiers).
 */
export declare function detectWorkflowKeyword(text: string): boolean;
/**
 * The steering note injected into a triggered turn. A soft nudge, not a
 * forced tool call — the model keeps discretion so a casual mention of
 * "workflow" doesn't derail an unrelated request.
 */
export declare function buildWorkflowSteeringNotice(): string;
