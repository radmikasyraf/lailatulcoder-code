/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * The label for ONE identity line, or null when the line is not one.
 *
 * Precedence mirrors what each suffix distinguishes: a chunk role is its
 * chunk id; a round suffix separates pipeline stages that share a role
 * (verify round 1 vs 2); the owned-file suffix separates the per-heavy-file
 * launches of an invariant role. Round wins over file when both appear —
 * the same order cost-ledger's rows always used.
 */
export declare function labelFromIdentityLine(line: string): string | null;
/**
 * The first line-anchored identity line in a launch prompt, parsed. For a
 * CLI-built launch the identity IS line one, so its own line always wins
 * over anything quoted below it; a launcher-prepended context line is prose
 * and never matches, so the agent's own line is still the first hit.
 */
export declare function labelFromLaunchPrompt(prompt: string): string | null;
