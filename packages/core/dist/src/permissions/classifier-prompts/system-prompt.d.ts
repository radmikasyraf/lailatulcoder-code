/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Classifier system prompt template + builder.
 *
 * Built-in ALLOW / SOFT BLOCK / HARD BLOCK / ENVIRONMENT lists are hardcoded
 * here. User-configured hints
 * (`permissions.autoMode.hints.{allow,softDeny,hardDeny}`) and environment
 * (`permissions.autoMode.environment`) are appended additively to the
 * corresponding section. Replace-mode is not supported.
 *
 * The legacy `permissions.autoMode.hints.deny` key is preserved as a
 * deprecated alias for `softDeny` so existing user settings keep working.
 *
 * Stage 1 and Stage 2 share the same base prompt; the orchestrator appends
 * a stage-specific suffix when calling the model.
 */
import type { Config } from '../../config/config.js';
/** Built-in actions the classifier should default to allowing. */
export declare const BUILTIN_ALLOW: readonly string[];
/**
 * Built-in SOFT BLOCK actions. The classifier should block these unless the
 * user's most recent explicit request asked for that exact action and scope.
 *
 * "Soft" means user intent CAN unblock — e.g. the user explicitly asking
 * "edit my .qwen/settings.json and add envKey FOO=bar" authorizes the
 * specific edit named, but does not authorize unrelated changes to the
 * same file.
 */
export declare const BUILTIN_SOFT_DENY: readonly string[];
/**
 * Built-in HARD BLOCK actions. The classifier must block these in AUTO mode
 * regardless of user hints, recent user requests, or apparent project
 * authorization. The user can still switch modes or manually approve outside
 * AUTO — HARD BLOCK only governs what AUTO is allowed to auto-approve.
 */
export declare const BUILTIN_HARD_DENY: readonly string[];
/**
 * Combined deny list. Kept for backward compatibility with callers and tests
 * that iterate every built-in block entry without caring about severity.
 */
export declare const BUILTIN_DENY: readonly string[];
/** Built-in environment / context lines. */
export declare const BUILTIN_ENVIRONMENT: readonly string[];
/**
 * Compose the base classifier system prompt.
 *
 * User-provided `autoMode.hints.{allow, softDeny, hardDeny}` and
 * `autoMode.environment` are appended after the built-in entries in their
 * respective sections. The deprecated `autoMode.hints.deny` key is merged
 * into the SOFT BLOCK user section.
 *
 * Stage-specific suffix (see classifier orchestrator) is appended separately.
 */
export declare function buildClassifierSystemPrompt(config: Config): string;
/**
 * Per-entry character cap and per-section count cap on user-provided
 * hints / environment lines. Documented in `auto-mode.md` ("Each entry
 * is capped at 200 characters", "accept up to 50 entries each") —
 * enforce them here so a hostile or accidental large hint payload
 * cannot bloat the classifier system prompt and overflow the fast
 * model's context window.
 */
export declare const MAX_USER_HINT_LENGTH = 200;
export declare const MAX_USER_HINTS_PER_SECTION = 50;
/**
 * Stage-1 suffix appended after the transcript. Asks for a minimal yes/no
 * verdict so the model can return ~6 output tokens on the happy path.
 */
export declare const STAGE1_SUFFIX = "\nRespond with only { \"shouldBlock\": true | false }. No reasoning, no reason field. Err on the side of blocking \u2014 stage 2 will review uncertain blocks.";
/**
 * Stage-2 suffix appended after the transcript. Instructs the model to reduce
 * stage-1 false positives via chain-of-thought review.
 */
export declare const STAGE2_SUFFIX = "\nStage 1 flagged this as potentially unsafe. Review carefully \u2014 false positives hurt user experience. Use the thinking field to reason about it. If safe, set shouldBlock=false. If unsafe, set shouldBlock=true and provide one short sentence in reason.";
