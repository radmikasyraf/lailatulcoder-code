/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { FinishReason } from './genai-compat.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage, getErrorStatus, UnauthorizedError, toFriendlyError, } from '../utils/errors.js';
import { getThoughtSummary, } from '../utils/thoughtUtils.js';
import { getProviderToolCallId } from './toolCallIdUtils.js';
const ERROR_REPORT_HISTORY_TAIL_COUNT = 8;
const ERROR_REPORT_TEXT_PREVIEW_CHARS = 200;
export var GeminiEventType;
(function (GeminiEventType) {
    GeminiEventType["Content"] = "content";
    GeminiEventType["ToolCallRequest"] = "tool_call_request";
    GeminiEventType["ToolCallResponse"] = "tool_call_response";
    GeminiEventType["ToolCallConfirmation"] = "tool_call_confirmation";
    GeminiEventType["UserCancelled"] = "user_cancelled";
    GeminiEventType["Error"] = "error";
    GeminiEventType["ChatCompressed"] = "chat_compressed";
    GeminiEventType["Thought"] = "thought";
    GeminiEventType["MaxSessionTurns"] = "max_session_turns";
    GeminiEventType["SessionTokenLimitExceeded"] = "session_token_limit_exceeded";
    GeminiEventType["Finished"] = "finished";
    GeminiEventType["LoopDetected"] = "loop_detected";
    GeminiEventType["Citation"] = "citation";
    GeminiEventType["Retry"] = "retry";
    GeminiEventType["HookSystemMessage"] = "hook_system_message";
    GeminiEventType["UserPromptSubmitBlocked"] = "user_prompt_submit_blocked";
    GeminiEventType["StopHookLoop"] = "stop_hook_loop";
    GeminiEventType["GoalState"] = "goal_state";
    GeminiEventType["ActiveGoal"] = "active_goal";
    /** The system switched to a fallback model after the primary (or prior
     *  fallback) exhausted retries on a capacity/availability error. */
    GeminiEventType["ModelFallback"] = "model_fallback";
})(GeminiEventType || (GeminiEventType = {}));
function normalizeRequestParts(req) {
    const parts = Array.isArray(req) ? req : [req];
    return parts.map((part) => typeof part === 'string' ? { text: part } : part);
}
function summarizeParts(parts) {
    return {
        partCount: parts.length,
        functionCalls: parts
            .map((part) => part.functionCall?.name)
            .filter((name) => typeof name === 'string'),
        functionResponses: parts
            .map((part) => part.functionResponse?.name)
            .filter((name) => typeof name === 'string'),
        textPreview: (() => {
            let textPreview = '';
            for (const part of parts) {
                if (typeof part.text !== 'string' || part.thought)
                    continue;
                const remaining = ERROR_REPORT_TEXT_PREVIEW_CHARS - textPreview.length;
                if (remaining <= 0)
                    break;
                textPreview += part.text.slice(0, remaining);
            }
            return textPreview;
        })(),
    };
}
function summarizeHistoryEntry(content) {
    return {
        role: content.role,
        ...summarizeParts(content.parts ?? []),
    };
}
function buildApiErrorReportContext(chat, req) {
    const requestParts = normalizeRequestParts(req);
    return {
        history: {
            rawLength: chat.getHistoryLength(),
            tail: chat
                .getHistoryTailShallow(ERROR_REPORT_HISTORY_TAIL_COUNT, 
            /* curated */ true)
                .map(summarizeHistoryEntry),
        },
        request: summarizeParts(requestParts),
    };
}
function duplicateProviderToolCallMessage(providerCallId) {
    return (`Duplicate provider tool call id "${providerCallId}" was already handled. ` +
        `The duplicate tool call was ignored and not executed again. If you ` +
        `intended to run this tool again, re-issue the call with a new unique ` +
        `tool-call id (or explicitly different arguments).`);
}
export function createDuplicateProviderToolCallResponse(request) {
    const providerCallId = request.providerCallId ?? request.callId;
    const message = duplicateProviderToolCallMessage(providerCallId);
    return {
        callId: request.callId,
        responseParts: [
            {
                functionResponse: {
                    id: request.callId,
                    name: request.name,
                    response: { error: message },
                },
            },
        ],
        resultDisplay: message,
        error: new Error(message),
        errorType: ToolErrorType.EXECUTION_FAILED,
        executionStatus: 'not_started',
    };
}
export function markDuplicateProviderToolCallResponseSent(providerCallId, duplicateProviderToolCallResponseIds) {
    duplicateProviderToolCallResponseIds.add(providerCallId);
}
/**
 * Finds the first tool call in `items` that must trip the repeated-duplicate
 * circuit breaker. `isReplayOfHandled` decides whether an item replays an
 * already-handled call (same provider id AND same (name, args) fingerprint
 * — see `isReplayOfHandledToolCall`); an id collision with different args is
 * not a replay and never trips the breaker. A replay trips it once a
 * synthetic duplicate response was already sent for its provider id, or when
 * the same handled id replays more than once within one batch.
 */
export function findRepeatedDuplicateProviderToolCall(items, getProviderCallId, isReplayOfHandled, duplicateProviderToolCallResponseIds) {
    const repeatedProviderIds = new Map();
    for (const item of items) {
        const providerCallId = getProviderCallId(item);
        if (!providerCallId || !isReplayOfHandled(item)) {
            continue;
        }
        repeatedProviderIds.set(providerCallId, (repeatedProviderIds.get(providerCallId) ?? 0) + 1);
    }
    return items.find((item) => {
        const providerCallId = getProviderCallId(item);
        return (providerCallId !== undefined &&
            isReplayOfHandled(item) &&
            (duplicateProviderToolCallResponseIds.has(providerCallId) ||
                (repeatedProviderIds.get(providerCallId) ?? 0) > 1));
    });
}
export var CompressionStatus;
(function (CompressionStatus) {
    /** The compression was successful */
    CompressionStatus[CompressionStatus["COMPRESSED"] = 1] = "COMPRESSED";
    /** The compression failed due to the compression inflating the token count */
    CompressionStatus[CompressionStatus["COMPRESSION_FAILED_INFLATED_TOKEN_COUNT"] = 2] = "COMPRESSION_FAILED_INFLATED_TOKEN_COUNT";
    /** The compression failed due to an error counting tokens */
    CompressionStatus[CompressionStatus["COMPRESSION_FAILED_TOKEN_COUNT_ERROR"] = 3] = "COMPRESSION_FAILED_TOKEN_COUNT_ERROR";
    /** The compression failed due to receiving an empty or null summary */
    CompressionStatus[CompressionStatus["COMPRESSION_FAILED_EMPTY_SUMMARY"] = 4] = "COMPRESSION_FAILED_EMPTY_SUMMARY";
    /** The compression was not necessary and no action was taken */
    CompressionStatus[CompressionStatus["NOOP"] = 5] = "NOOP";
    /**
     * The compression call produced a summary, but the output reached the
     * requested output budget — the fixed COMPACT_MAX_OUTPUT_TOKENS ceiling
     * or the window-clamped budget below it (issue #7960) — indicating
     * likely truncation. The summary
     * is dropped (newHistory=null) and the attempt is treated as a failure:
     * `isCompressionFailureStatus` returns true so it counts toward the
     * per-chat circuit breaker. Kept distinct from
     * `COMPRESSION_FAILED_EMPTY_SUMMARY` so telemetry can separate
     * prompt-quality failures (empty / nonsensical summary) from capacity
     * failures (output cap hit, may need a higher cap or finer-grained
     * splitter). (R5.2)
     */
    CompressionStatus[CompressionStatus["COMPRESSION_FAILED_OUTPUT_TRUNCATED"] = 6] = "COMPRESSION_FAILED_OUTPUT_TRUNCATED";
})(CompressionStatus || (CompressionStatus = {}));
function getDisplayContentParts(response) {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const displayParts = [];
    for (const part of parts) {
        if (part.thought) {
            continue;
        }
        if (typeof part.text === 'string' && part.text.length > 0) {
            displayParts.push({ text: part.text });
        }
        const inlineData = part.inlineData;
        if (inlineData?.mimeType?.trim().toLowerCase().startsWith('image/') &&
            typeof inlineData.data === 'string' &&
            inlineData.data.length > 0) {
            displayParts.push({
                inlineData: {
                    data: inlineData.data,
                    mimeType: inlineData.mimeType,
                    ...(typeof inlineData.displayName === 'string'
                        ? { displayName: inlineData.displayName }
                        : {}),
                },
            });
        }
    }
    return displayParts;
}
// A turn manages the agentic loop turn within the server context.
export class Turn {
    chat;
    prompt_id;
    pendingToolCalls = [];
    pendingCitations = new Set();
    finishReason = undefined;
    currentResponseId;
    goalContext;
    constructor(chat, prompt_id, goalContext) {
        this.chat = chat;
        this.prompt_id = prompt_id;
        this.goalContext = goalContext ? { ...goalContext } : undefined;
    }
    // The run method yields simpler events suitable for server logic
    async *run(model, req, signal) {
        try {
            // Note: This assumes `sendMessageStream` yields events like
            // { type: StreamEventType.RETRY } or { type: StreamEventType.CHUNK, value: GenerateContentResponse }
            const responseStream = await this.chat.sendMessageStream(model, {
                message: req,
                config: {
                    abortSignal: signal,
                },
            }, this.prompt_id, this.goalContext);
            for await (const streamEvent of responseStream) {
                if (signal?.aborted) {
                    yield { type: GeminiEventType.UserCancelled };
                    return;
                }
                // Handle the new RETRY event: clear accumulated state from the
                // previous attempt to avoid duplicate tool calls and stale metadata.
                if (streamEvent.type === 'retry') {
                    this.pendingToolCalls.length = 0;
                    this.pendingCitations.clear();
                    this.finishReason = undefined;
                    yield {
                        type: GeminiEventType.Retry,
                        retryInfo: streamEvent.retryInfo,
                        isContinuation: streamEvent.isContinuation,
                    };
                    continue; // Skip to the next event in the stream
                }
                // Surface model fallback transitions from the chat stream as the
                // top-level ModelFallback event. The UI uses this to notify the user
                // that the system switched to a different model due to capacity issues.
                if (streamEvent.type === 'model_fallback') {
                    // Clear accumulated state from the failed model's partial response
                    this.pendingToolCalls.length = 0;
                    this.pendingCitations.clear();
                    this.finishReason = undefined;
                    this.currentResponseId = undefined;
                    yield {
                        type: GeminiEventType.ModelFallback,
                        fromModel: streamEvent.info.fromModel,
                        toModel: streamEvent.info.toModel,
                        statusCode: streamEvent.info.statusCode,
                        fallbackIndex: streamEvent.info.fallbackIndex,
                    };
                    continue;
                }
                // Surface auto-compaction that fired inside chat.sendMessageStream
                // as the top-level ChatCompressed event so existing UI handlers stay
                // connected. This bridge is the primary path for auto-compaction
                // events; manual /compress emits its own ChatCompressed in
                // GeminiClient.tryCompressChat.
                if (streamEvent.type === 'compressed') {
                    yield {
                        type: GeminiEventType.ChatCompressed,
                        value: streamEvent.info,
                    };
                    continue;
                }
                // Assuming other events are chunks with a `value` property
                const resp = streamEvent.value;
                if (!resp)
                    continue; // Skip if there's no response body
                // Track the current response ID for tool call correlation
                if (resp.responseId) {
                    this.currentResponseId = resp.responseId;
                }
                const thoughtSummary = getThoughtSummary(resp);
                if (thoughtSummary) {
                    yield {
                        type: GeminiEventType.Thought,
                        value: thoughtSummary,
                    };
                }
                const text = getResponseText(resp) ?? '';
                const displayParts = getDisplayContentParts(resp);
                const hasImage = displayParts.some((part) => 'inlineData' in part);
                if (text || hasImage) {
                    yield {
                        type: GeminiEventType.Content,
                        value: text,
                        ...(hasImage ? { parts: displayParts } : {}),
                    };
                }
                // Handle function calls (requesting tool execution)
                const functionCalls = resp.functionCalls ?? [];
                for (const fnCall of functionCalls) {
                    const event = this.handlePendingFunctionCall(fnCall);
                    if (event) {
                        yield event;
                    }
                }
                for (const citation of getCitations(resp)) {
                    this.pendingCitations.add(citation);
                }
                // Check if response was truncated or stopped for various reasons
                const finishReason = resp.candidates?.[0]?.finishReason;
                // This is the key change: Only yield 'Finished' if there is a finishReason.
                if (finishReason) {
                    // Mark pending tool calls so downstream can distinguish
                    // truncation from real parameter errors.
                    if (finishReason === FinishReason.MAX_TOKENS) {
                        for (const tc of this.pendingToolCalls) {
                            tc.wasOutputTruncated = true;
                        }
                    }
                    if (this.pendingCitations.size > 0) {
                        yield {
                            type: GeminiEventType.Citation,
                            value: `Citations:\n${[...this.pendingCitations].sort().join('\n')}`,
                        };
                        this.pendingCitations.clear();
                    }
                    this.finishReason = finishReason;
                    yield {
                        type: GeminiEventType.Finished,
                        value: {
                            reason: finishReason,
                            usageMetadata: resp.usageMetadata,
                        },
                    };
                }
            }
        }
        catch (e) {
            if (signal.aborted) {
                yield { type: GeminiEventType.UserCancelled };
                // Regular cancellation error, fail gracefully.
                return;
            }
            const originalStatus = getErrorStatus(e);
            const error = toFriendlyError(e);
            if (error instanceof UnauthorizedError) {
                throw error;
            }
            let contextForReport;
            try {
                contextForReport = buildApiErrorReportContext(this.chat, req);
            }
            catch (diagError) {
                contextForReport = {
                    history: {
                        error: 'failed to build diagnostic summary',
                        cause: diagError instanceof Error
                            ? { message: diagError.message, stack: diagError.stack }
                            : String(diagError),
                    },
                    request: summarizeParts(normalizeRequestParts(req)),
                };
            }
            await reportError(error, 'Error when talking to API', contextForReport, 'Turn.run-sendMessageStream', { contextAlreadySummarized: true });
            const structuredError = {
                message: getErrorMessage(error),
                status: getErrorStatus(error) ?? originalStatus,
            };
            await this.chat.maybeIncludeSchemaDepthContext(structuredError);
            yield { type: GeminiEventType.Error, value: { error: structuredError } };
            return;
        }
    }
    handlePendingFunctionCall(fnCall) {
        const callId = fnCall.id ??
            `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const providerCallId = getProviderToolCallId(fnCall) ?? fnCall.id;
        const name = fnCall.name || 'undefined_tool_name';
        const args = (fnCall.args || {});
        const toolCallRequest = {
            callId,
            ...(providerCallId ? { providerCallId } : {}),
            name,
            args,
            isClientInitiated: false,
            prompt_id: this.prompt_id,
            response_id: this.currentResponseId,
            ...(this.goalContext ? { goalContext: { ...this.goalContext } } : {}),
        };
        this.pendingToolCalls.push(toolCallRequest);
        // Yield a request for the tool call, not the pending/confirming status
        return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
    }
}
function getCitations(resp) {
    return (resp.candidates?.[0]?.citationMetadata?.citations ?? [])
        .filter((citation) => citation.uri !== undefined)
        .map((citation) => {
        if (citation.title) {
            return `(${citation.title}) ${citation.uri}`;
        }
        return citation.uri;
    });
}
//# sourceMappingURL=turn.js.map