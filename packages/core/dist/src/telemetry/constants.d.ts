/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const SERVICE_NAME = "lailatul-coder";
export declare const EVENT_USER_PROMPT = "lailatul-coder.user_prompt";
export declare const EVENT_USER_RETRY = "lailatul-coder.user_retry";
export declare const EVENT_TOOL_CALL = "lailatul-coder.tool_call";
export declare const EVENT_REPEATED_TOOL_FAILURE_GUARD = "lailatul-coder.repeated_tool_failure_guard";
export declare const EVENT_API_REQUEST = "lailatul-coder.api_request";
export declare const EVENT_API_ERROR = "lailatul-coder.api_error";
export declare const EVENT_API_CANCEL = "lailatul-coder.api_cancel";
export declare const EVENT_API_RESPONSE = "lailatul-coder.api_response";
export declare const EVENT_CLI_CONFIG = "lailatul-coder.config";
export declare const EVENT_SESSION_START = "session.start";
export declare const EVENT_SESSION_END = "session.end";
export declare const EVENT_EXTENSION_DISABLE = "lailatul-coder.extension_disable";
export declare const EVENT_EXTENSION_ENABLE = "lailatul-coder.extension_enable";
export declare const EVENT_EXTENSION_INSTALL = "lailatul-coder.extension_install";
export declare const EVENT_EXTENSION_UNINSTALL = "lailatul-coder.extension_uninstall";
export declare const EVENT_EXTENSION_UPDATE = "lailatul-coder.extension_update";
export declare const EVENT_FLASH_FALLBACK = "lailatul-coder.flash_fallback";
export declare const EVENT_RIPGREP_FALLBACK = "lailatul-coder.ripgrep_fallback";
export declare const EVENT_RIPGREP_RUNTIME_RECOVERY = "lailatul-coder.ripgrep_runtime_recovery";
export declare const EVENT_NEXT_SPEAKER_CHECK = "lailatul-coder.next_speaker_check";
export declare const EVENT_SLASH_COMMAND = "lailatul-coder.slash_command";
export declare const EVENT_IDE_CONNECTION = "lailatul-coder.ide_connection";
export declare const EVENT_CHAT_COMPRESSION = "lailatul-coder.chat_compression";
export declare const EVENT_INVALID_CHUNK = "lailatul-coder.chat.invalid_chunk";
export declare const EVENT_CONTENT_RETRY = "lailatul-coder.chat.content_retry";
export declare const EVENT_CONTENT_RETRY_FAILURE = "lailatul-coder.chat.content_retry_failure";
export declare const EVENT_PROTOCOL_TAG_SANITIZED = "lailatul-coder.chat.protocol_tag_sanitized";
export declare const EVENT_API_RETRY = "lailatul-coder.api_retry";
export declare const EVENT_CONVERSATION_FINISHED = "lailatul-coder.conversation_finished";
export declare const EVENT_MALFORMED_JSON_RESPONSE = "lailatul-coder.malformed_json_response";
export declare const EVENT_FILE_OPERATION = "lailatul-coder.file_operation";
export declare const EVENT_MODEL_SLASH_COMMAND = "lailatul-coder.slash_command.model";
export declare const EVENT_SUBAGENT_EXECUTION = "lailatul-coder.subagent_execution";
export declare const EVENT_SKILL_LAUNCH = "lailatul-coder.skill_launch";
export declare const EVENT_AUTH = "lailatul-coder.auth";
export declare const EVENT_USER_FEEDBACK = "lailatul-coder.user_feedback";
export declare const EVENT_TOOL_OUTPUT_TRUNCATED = "lailatul-coder.tool_output_truncated";
export declare const DEFAULT_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH: number;
export declare const SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT: number;
export declare function isValidSensitiveSpanAttributeMaxLength(value: number): boolean;
export declare const EVENT_PROMPT_SUGGESTION = "lailatul-coder.prompt_suggestion";
export declare const EVENT_SPECULATION = "lailatul-coder.speculation";
export declare const EVENT_WORKFLOW_KEYWORD = "lailatul-coder.workflow_keyword";
export declare const EVENT_WORKFLOW_RUN = "lailatul-coder.workflow_run";
export declare const EVENT_ARENA_SESSION_STARTED = "lailatul-coder.arena_session_started";
export declare const EVENT_ARENA_AGENT_COMPLETED = "lailatul-coder.arena_agent_completed";
export declare const EVENT_ARENA_SESSION_ENDED = "lailatul-coder.arena_session_ended";
export declare const EVENT_STARTUP_PERFORMANCE = "lailatul-coder.startup.performance";
export declare const EVENT_MEMORY_USAGE = "lailatul-coder.memory.usage";
export declare const EVENT_PERFORMANCE_BASELINE = "lailatul-coder.performance.baseline";
export declare const EVENT_PERFORMANCE_REGRESSION = "lailatul-coder.performance.regression";
export declare const EVENT_MEMORY_EXTRACT = "lailatul-coder.memory.extract";
export declare const EVENT_MEMORY_DREAM = "lailatul-coder.memory.dream";
export declare const EVENT_MEMORY_RECALL = "lailatul-coder.memory.recall";
export declare const EVENT_MEMORY_RECALL_DELIVERY = "lailatul-coder.memory.recall.delivery";
export declare const SPAN_INTERACTION = "lailatul-coder.interaction";
export declare const SPAN_LLM_REQUEST = "lailatul-coder.llm_request";
export declare const SPAN_TOOL = "lailatul-coder.tool";
export declare const SPAN_TOOL_EXECUTION = "lailatul-coder.tool.execution";
/** Brackets the time a tool spends in `awaiting_approval` waiting on the user. */
export declare const SPAN_TOOL_BLOCKED_ON_USER = "lailatul-coder.tool.blocked_on_user";
/** Wraps each pre/post-tool-use hook fire site for per-hook latency / decision tracking. */
export declare const SPAN_HOOK = "lailatul-coder.hook";
/**
 * Wraps a single subagent invocation. Parents the LLM/tool/hook spans the
 * subagent emits, so concurrent subagents (parallel AGENT tool calls) get
 * isolated subtrees instead of interleaving under the parent interaction
 * (#3731 Phase 3).
 */
export declare const SPAN_SUBAGENT = "lailatul-coder.subagent";
export declare const TOOL_FAILURE_KIND_ATTRIBUTE = "tool.failure_kind";
export declare const TOOL_FAILURE_KIND_CANCELLED = "cancelled";
export declare const TOOL_FAILURE_KIND_PRE_HOOK_BLOCKED = "pre_hook_blocked";
export declare const TOOL_FAILURE_KIND_INVOCATION_GUARD_DENIED = "invocation_guard_denied";
export declare const TOOL_FAILURE_KIND_POST_HOOK_STOPPED = "post_hook_stopped";
export declare const TOOL_FAILURE_KIND_TOOL_ERROR = "tool_error";
export declare const TOOL_FAILURE_KIND_TOOL_EXCEPTION = "tool_exception";
export declare const TOOL_FAILURE_KIND_PERMISSION_DENIED = "permission_denied";
export declare const TOOL_FAILURE_KIND_PERMISSION_HOOK_DENIED = "permission_hook_denied";
export declare const TOOL_FAILURE_KIND_PLAN_MODE_BLOCKED = "plan_mode_blocked";
export declare const TOOL_FAILURE_KIND_NON_INTERACTIVE_DENIED = "non_interactive_denied";
export declare const TOOL_FAILURE_KIND_BACKGROUND_AGENT_DENIED = "background_agent_denied";
export declare const TOOL_FAILURE_KIND_TIMEOUT = "timeout";
