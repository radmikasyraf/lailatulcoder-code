/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'lailatul-coder';

export const EVENT_USER_PROMPT = 'lailatul-coder.user_prompt';
export const EVENT_USER_RETRY = 'lailatul-coder.user_retry';
export const EVENT_TOOL_CALL = 'lailatul-coder.tool_call';
export const EVENT_REPEATED_TOOL_FAILURE_GUARD =
  'lailatul-coder.repeated_tool_failure_guard';
export const EVENT_API_REQUEST = 'lailatul-coder.api_request';
export const EVENT_API_ERROR = 'lailatul-coder.api_error';
export const EVENT_API_CANCEL = 'lailatul-coder.api_cancel';
export const EVENT_API_RESPONSE = 'lailatul-coder.api_response';
export const EVENT_CLI_CONFIG = 'lailatul-coder.config';
export const EVENT_SESSION_START = 'session.start';
export const EVENT_SESSION_END = 'session.end';
export const EVENT_EXTENSION_DISABLE = 'lailatul-coder.extension_disable';
export const EVENT_EXTENSION_ENABLE = 'lailatul-coder.extension_enable';
export const EVENT_EXTENSION_INSTALL = 'lailatul-coder.extension_install';
export const EVENT_EXTENSION_UNINSTALL = 'lailatul-coder.extension_uninstall';
export const EVENT_EXTENSION_UPDATE = 'lailatul-coder.extension_update';
export const EVENT_FLASH_FALLBACK = 'lailatul-coder.flash_fallback';
export const EVENT_RIPGREP_FALLBACK = 'lailatul-coder.ripgrep_fallback';
export const EVENT_RIPGREP_RUNTIME_RECOVERY =
  'lailatul-coder.ripgrep_runtime_recovery';
export const EVENT_NEXT_SPEAKER_CHECK = 'lailatul-coder.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'lailatul-coder.slash_command';
export const EVENT_IDE_CONNECTION = 'lailatul-coder.ide_connection';
export const EVENT_CHAT_COMPRESSION = 'lailatul-coder.chat_compression';
export const EVENT_INVALID_CHUNK = 'lailatul-coder.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'lailatul-coder.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE =
  'lailatul-coder.chat.content_retry_failure';
export const EVENT_PROTOCOL_TAG_SANITIZED =
  'lailatul-coder.chat.protocol_tag_sanitized';
// Phase 4b — HTTP-status retry telemetry emitted by `retryWithBackoff` for
// 429 / 5xx errors at LLM call sites. Distinct from EVENT_CONTENT_RETRY,
// which is fired by geminiChat for InvalidStreamError retries on a separate
// retry budget. See docs/design/telemetry-llm-request-timing-design.md.
export const EVENT_API_RETRY = 'lailatul-coder.api_retry';
export const EVENT_CONVERSATION_FINISHED = 'lailatul-coder.conversation_finished';
export const EVENT_MALFORMED_JSON_RESPONSE =
  'lailatul-coder.malformed_json_response';
export const EVENT_FILE_OPERATION = 'lailatul-coder.file_operation';
export const EVENT_MODEL_SLASH_COMMAND = 'lailatul-coder.slash_command.model';
export const EVENT_SUBAGENT_EXECUTION = 'lailatul-coder.subagent_execution';
export const EVENT_SKILL_LAUNCH = 'lailatul-coder.skill_launch';
export const EVENT_AUTH = 'lailatul-coder.auth';
export const EVENT_USER_FEEDBACK = 'lailatul-coder.user_feedback';
export const EVENT_TOOL_OUTPUT_TRUNCATED = 'lailatul-coder.tool_output_truncated';

export const DEFAULT_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH = 1024 * 1024;
export const SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT = 100 * 1024 * 1024;

export function isValidSensitiveSpanAttributeMaxLength(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT
  );
}

// Prompt Suggestion Events
export const EVENT_PROMPT_SUGGESTION = 'lailatul-coder.prompt_suggestion';
export const EVENT_SPECULATION = 'lailatul-coder.speculation';

// Workflow Events (#4721)
export const EVENT_WORKFLOW_KEYWORD = 'lailatul-coder.workflow_keyword';
export const EVENT_WORKFLOW_RUN = 'lailatul-coder.workflow_run';

// Arena Events
export const EVENT_ARENA_SESSION_STARTED = 'lailatul-coder.arena_session_started';
export const EVENT_ARENA_AGENT_COMPLETED = 'lailatul-coder.arena_agent_completed';
export const EVENT_ARENA_SESSION_ENDED = 'lailatul-coder.arena_session_ended';

// Performance Events
export const EVENT_STARTUP_PERFORMANCE = 'lailatul-coder.startup.performance';
export const EVENT_MEMORY_USAGE = 'lailatul-coder.memory.usage';
export const EVENT_PERFORMANCE_BASELINE = 'lailatul-coder.performance.baseline';
export const EVENT_PERFORMANCE_REGRESSION = 'lailatul-coder.performance.regression';

// Managed Auto-Memory Events
export const EVENT_MEMORY_EXTRACT = 'lailatul-coder.memory.extract';
export const EVENT_MEMORY_DREAM = 'lailatul-coder.memory.dream';
export const EVENT_MEMORY_RECALL = 'lailatul-coder.memory.recall';
export const EVENT_MEMORY_RECALL_DELIVERY = 'lailatul-coder.memory.recall.delivery';

// Session Tracing Span Names
export const SPAN_INTERACTION = 'lailatul-coder.interaction';
export const SPAN_LLM_REQUEST = 'lailatul-coder.llm_request';
export const SPAN_TOOL = 'lailatul-coder.tool';
export const SPAN_TOOL_EXECUTION = 'lailatul-coder.tool.execution';
/** Brackets the time a tool spends in `awaiting_approval` waiting on the user. */
export const SPAN_TOOL_BLOCKED_ON_USER = 'lailatul-coder.tool.blocked_on_user';
/** Wraps each pre/post-tool-use hook fire site for per-hook latency / decision tracking. */
export const SPAN_HOOK = 'lailatul-coder.hook';
/**
 * Wraps a single subagent invocation. Parents the LLM/tool/hook spans the
 * subagent emits, so concurrent subagents (parallel AGENT tool calls) get
 * isolated subtrees instead of interleaving under the parent interaction
 * (#3731 Phase 3).
 */
export const SPAN_SUBAGENT = 'lailatul-coder.subagent';

// Tool failure kind span attribute and vocabulary — shared across
// coreToolScheduler, session-tracing, and telemetry docs so the
// write sites and documented values cannot drift.
export const TOOL_FAILURE_KIND_ATTRIBUTE = 'tool.failure_kind';
export const TOOL_FAILURE_KIND_CANCELLED = 'cancelled';
export const TOOL_FAILURE_KIND_PRE_HOOK_BLOCKED = 'pre_hook_blocked';
export const TOOL_FAILURE_KIND_INVOCATION_GUARD_DENIED =
  'invocation_guard_denied';
export const TOOL_FAILURE_KIND_POST_HOOK_STOPPED = 'post_hook_stopped';
export const TOOL_FAILURE_KIND_TOOL_ERROR = 'tool_error';
export const TOOL_FAILURE_KIND_TOOL_EXCEPTION = 'tool_exception';
export const TOOL_FAILURE_KIND_PERMISSION_DENIED = 'permission_denied';
export const TOOL_FAILURE_KIND_PERMISSION_HOOK_DENIED =
  'permission_hook_denied';
export const TOOL_FAILURE_KIND_PLAN_MODE_BLOCKED = 'plan_mode_blocked';
export const TOOL_FAILURE_KIND_NON_INTERACTIVE_DENIED =
  'non_interactive_denied';
export const TOOL_FAILURE_KIND_BACKGROUND_AGENT_DENIED =
  'background_agent_denied';
export const TOOL_FAILURE_KIND_TIMEOUT = 'timeout';
