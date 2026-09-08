/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic pre-filter for destructive git and IaC commands in AUTO mode.
 *
 * Runs BEFORE the L5.3 LLM classifier as a Layer 0 guard. The classifier is
 * non-deterministic and can fail due to API unavailability, timeout, or poor
 * judgment on ambiguous prompts like "clean up the git state". This module
 * provides deterministic regex-based blocking that cannot be bypassed by
 * classifier failures.
 *
 * Only applies in AUTO mode — YOLO mode is an explicit opt-out of all guards.
 */
import type { Content } from '@google/genai';
/**
 * Check if the user prompt explicitly mentions discarding local work.
 */
export declare function userMentionsDiscard(userPrompt: string): boolean;
/**
 * Extract the last user-role text from the conversation messages.
 * Used to determine whether the user explicitly requested destructive actions.
 */
export declare function extractLastUserPrompt(messages: readonly Content[]): string | undefined;
/** Result of a destructive command check. */
export interface DestructiveCommandResult {
    blocked: boolean;
    reason: string;
}
/**
 * Register a commit SHA made by the agent during this session.
 * Used to allow `git commit --amend` when the target commit was made
 * by the agent in the current session.
 */
export declare function registerSessionCommit(sha: string): void;
/**
 * Check whether a `git commit --amend` targets a commit made this session.
 * Reads the current HEAD commit SHA and checks against registered session commits.
 */
export declare function isAmendOfSessionCommit(cwd: string): boolean;
/**
 * Clear all session commit tracking. Called on session end or mode switch.
 */
export declare function clearSessionCommits(): void;
/**
 * Check whether a shell command is destructively blocked by the deterministic
 * guard. Runs before the L5.3 classifier — failures here are hard blocks
 * regardless of classifier availability.
 *
 * @param command - The raw shell command string
 * @param userPrompt - The user's most recent prompt text
 * @param cwd - Working directory for git operations (amend check)
 * @returns Block result if the command is destructive, null otherwise
 */
export declare function isDestructiveCommand(command: string, userPrompt: string, cwd?: string): DestructiveCommandResult | null;
