/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * postCompactAttachments — pure builders for the message blocks injected
 * AFTER the summary in a compacted history. Replaces lailatul-coder's tail-
 * preservation model (split-point + last 30%) with claude-code's
 * "summary + restored attachments" model.
 *
 * Everything in this module is message-history-driven: no separate state
 * caches, no new message types. Extractors walk `Content[]`, builders
 * produce ordinary user/model `Content` objects with text/inlineData parts.
 */
import type { Content, Part } from '@google/genai';
export declare const POST_COMPACT_MAX_FILES_TO_RESTORE = 5;
export declare const POST_COMPACT_MAX_TOKENS_PER_FILE = 5000;
export declare const POST_COMPACT_TOKEN_BUDGET = 50000;
export declare const POST_COMPACT_MAX_IMAGES_TO_RESTORE = 3;
/**
 * Walk the history newest-first, collect the most recently touched file
 * paths, deduplicated. Older mentions of the same path are dropped in
 * favor of the most recent one.
 */
export declare function extractRecentFilePaths(history: Content[], maxFiles: number): string[];
export interface ExtractedImage {
    /** The original `inlineData` part, ready to embed verbatim. */
    part: Part;
    /** Turn index in the original history (for metadata header). */
    turnIndex: number;
    /** Name of the tool whose call immediately preceded this image, if any. */
    sourceToolName?: string;
    /** Args of that tool call, for the metadata header. */
    sourceToolArgs?: Record<string, unknown>;
}
/**
 * Walk the history newest-first, collect up to `maxImages` image parts
 * (top-level user-pasted images AND tool-returned images nested in
 * `functionResponse.parts`), and pair each with the preceding
 * model+functionCall (if any) as source-tool metadata.
 *
 * Returns oldest-first so callers can compose a chronological strip
 * (last user-visible state ends up at the bottom of the attachment).
 */
export declare function extractRecentImages(history: Content[], maxImages: number): ExtractedImage[];
/**
 * Count images RETURNED BY TOOLS across the whole history — inlineData
 * image parts nested inside `functionResponse.parts`. User-pasted
 * top-level images are intentionally excluded: this drives the
 * computer-use screenshot-overflow auto-compact trigger, whose concern
 * is screenshot accumulation from tool results, not occasional pastes.
 */
export declare function countToolResponseImages(history: Content[]): number;
export type FileEmbedResult = {
    kind: 'embed';
    content: string;
} | {
    kind: 'reference';
} | {
    kind: 'missing';
} | {
    kind: 'binary';
};
/**
 * Read a file from disk and decide whether to embed its full content
 * (small files, ≤ maxTokens × CHARS_PER_TOKEN) or only return a path
 * reference (large files; the agent must call read_file to view them).
 *
 * Returns 'missing' if the file no longer exists (deleted between when
 * it was last touched and compaction time), 'binary' if it appears to
 * contain non-text data.
 */
export declare function readFileSizeAdaptive(filePath: string, maxTokens: number, signal?: AbortSignal): Promise<FileEmbedResult>;
/**
 * Compose the file-restoration section of a post-compact history. Reads
 * each file from disk, classifies as embed/reference/missing/binary, and
 * produces:
 *  - One reference block listing all large files (path only), if any.
 *  - One embed block per small file with full content.
 *  - Nothing for missing/binary files.
 *
 * Total embedded chars are capped at POST_COMPACT_TOKEN_BUDGET ×
 * CHARS_PER_TOKEN. Files that would push over the budget are downgraded
 * to references.
 */
export declare function buildFileRestorationBlocks(filePaths: string[], signal?: AbortSignal): Promise<Content[]>;
/**
 * Compose the image-restoration block: a single user Content whose first
 * part is a text header listing each image's source (turn index + tool
 * call + args), followed by the inlineData parts in chronological order.
 *
 * Returns null if there are no images so callers can skip it cleanly.
 */
export declare function buildImageRestorationBlock(images: ExtractedImage[]): Content | null;
/**
 * Strip the model's drafting scratchpad before the summary becomes the new
 * post-compact context. The compression prompt instructs the summary model
 * to wrap its chain-of-thought reasoning in an `<analysis>...</analysis>`
 * block, which is purely for the model's own benefit; keeping it in history
 * wastes tokens and degrades signal-to-noise for the resuming agent.
 *
 * Defensive design: if the strip removes everything (model produced ONLY an
 * analysis block with no summary content), fall back to the raw summary so
 * the caller sees something rather than an empty string — the inflation
 * guard upstream will still NOOP this round, but we don't want to silently
 * lose the entire model response.
 */
/**
 * Strip `<analysis>...</analysis>` chain-of-thought blocks from raw
 * summary text. Exposed separately from `postProcessSummary` so the
 * PostCompact hook event can receive the same stripped text that
 * enters history — without the resume trailer, which is wrapper
 * decoration meant for the next agent turn only (Finding 8a).
 *
 * NOTE on the regex:
 *  - `[\s\S]*?` (non-greedy) handles newlines inside the block AND
 *    stops at the first `</analysis>` — so multiple non-overlapping
 *    blocks each get stripped via the `/g` flag.
 *  - It matches the exact tag `<analysis>` only. If the prompt ever
 *    evolves to use attributes (e.g. `<analysis type="...">`) or
 *    nested `<analysis>` tags, this pattern will leak content. The
 *    compression prompt is under our control, so we keep the pattern
 *    strict rather than over-engineering.
 *  - The unclosed-tag fallback (`<analysis>[\s\S]*$`) catches the case
 *    where the model started an `<analysis>` block and ran out of
 *    output tokens before closing it. Without this, the closed-tag
 *    regex above misses and the entire scratchpad leaks into history
 *    via the fallback path in `postProcessSummary`.
 */
export declare function stripAnalysisBlock(rawSummary: string): string;
export declare function postProcessSummary(rawSummary: string): string;
/**
 * Minimal projection of a background subagent task carried into post-compact
 * attachments. Decoupled from the registry's `AgentTask` so the attachment
 * layer does not import the registry types and so tests can build cases
 * inline.
 */
export interface SubagentSnapshot {
    id: string;
    description: string;
    status: 'running' | 'paused';
    /** ms epoch when the task was registered. Used for stable ordering. */
    startTime: number;
}
export interface ComposePostCompactOptions {
    /**
     * Workspace root. When set, file paths from history that resolve
     * outside this root are silently skipped (Finding 4). Without this,
     * an adversarial model that issued `read_file('/etc/passwd')` —
     * even one denied by the permission system — would have its path
     * extracted and re-read off disk into the next prompt.
     */
    workspaceRoot?: string;
    /**
     * Cancels in-progress file reads (Finding 5). Propagated to
     * `buildFileRestorationBlocks` → `readFileSizeAdaptive` →
     * `readFile(path, { signal })`.
     */
    signal?: AbortSignal;
    /**
     * Max recent files to restore. Defaults to
     * `POST_COMPACT_MAX_FILES_TO_RESTORE`. Configurable via
     * `chatCompression.maxRecentFilesToRetain` (env
     * `QWEN_COMPACT_MAX_RECENT_FILES`).
     */
    maxFiles?: number;
    /**
     * Max recent images to restore. Defaults to
     * `POST_COMPACT_MAX_IMAGES_TO_RESTORE`. Configurable via
     * `chatCompression.maxRecentImagesToRetain` (env
     * `QWEN_COMPACT_MAX_RECENT_IMAGES`).
     */
    maxImages?: number;
    /**
     * When `true`, prepend a `<plan-mode-active>` reminder block before the
     * file/image attachments so the post-compact agent does not forget that
     * destructive tools remain gated. Sourced from `config.getApprovalMode()
     * === ApprovalMode.PLAN` at the call site. The summary itself may
     * mention plan mode but cannot be trusted to — the reminder is a
     * structural guarantee.
     */
    planModeActive?: boolean;
    /**
     * Snapshot of background subagent tasks (running or paused) at
     * compaction time. Rendered as a `<background-tasks>` reminder block.
     * Empty array or `undefined` renders no block. Terminal-state tasks
     * (completed/failed/cancelled) should already be filtered out by the
     * caller — they have already emitted their notification XML and need
     * no reminder.
     */
    runningSubagents?: SubagentSnapshot[];
}
/**
 * Build the mid-session state-reminder parts (plan-mode banner + background
 * subagent snapshot) that lead the post-compact attachment. Extracted as a
 * single source of truth so BOTH the normal `composePostCompactHistory`
 * path AND its catch-fallback emit the same blocks — otherwise the fallback
 * silently drops plan-mode enforcement and the subagent roster (the exact
 * drift PR #4688 review caught). Pure: no I/O, safe to call from a catch.
 */
export declare function buildStateReminderParts(options: {
    planModeActive?: boolean;
    runningSubagents?: SubagentSnapshot[];
}): Part[];
export declare function composePostCompactHistory(history: Content[], summary: string, options?: ComposePostCompactOptions): Promise<Content[]>;
