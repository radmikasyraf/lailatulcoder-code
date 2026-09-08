/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * System prompts for workflow subagents.
 *
 * Verbatim from claude-code 2.1.160 binary's §XmO constant (confirmed via
 * `strings -a -n 6 <binary> | rg "You are a subagent spawned by a workflow"`).
 * Kept in its own module so future phases (P3 schema mode via §ZmO, P5 budget
 * guidance) can introduce variant prompts without touching the orchestrator.
 */
/**
 * Base subagent prompt — used when no schema is set on agent() opts.
 *
 * VERBATIM from claude-code 2.1.160 binary §XmO. The five bullet points are
 * load-bearing for subagent behavior alignment:
 *  - "Output the literal result" — discourages explanatory text
 *  - "raw JSON ... no code fences" — critical for schema-returning agents in P3
 *  - "Do NOT use SendUserMessage" — closes the back-channel escape hatch
 *  - "Be concise" — bounds token cost
 *
 * P1 omits the §ZmO variant (schema-mode) because P1 throws on agent({schema}).
 * When P3 adds StructuredOutput, add WORKFLOW_SUBAGENT_SYSTEM_PROMPT_WITH_SCHEMA
 * here as a separate const.
 */
export declare const WORKFLOW_SUBAGENT_SYSTEM_PROMPT: string;
/**
 * Schema-mode subagent prompt — used when `agent({schema})` enforces the
 * StructuredOutput contract. The `structured_output` tool's own description
 * (see tools/syntheticOutput.ts) already tells the model the tool ends the
 * session on the first valid call; this prompt reinforces that the FINAL
 * answer must travel through that tool, not through plain text.
 *
 * Aligns with upstream Claude Code 2.1.168 §ZmO constant in spirit (binary
 * verbatim is not yet captured — the load-bearing fragments are: must call
 * the tool, args must validate, no plain-text fallback, no SendUserMessage).
 */
export declare const WORKFLOW_SUBAGENT_SYSTEM_PROMPT_WITH_SCHEMA: string;
