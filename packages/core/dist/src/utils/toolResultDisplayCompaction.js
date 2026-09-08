/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export const MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS = 32_000;
export const MAX_RETAINED_AGENT_FIELD_CHARS = 8_000;
export const MAX_RETAINED_FILE_DIFF_CHARS = 50_000;
export const MAX_RETAINED_FILE_CONTENT_CHARS = 16_000;
export const MAX_RETAINED_ANSI_OUTPUT_LINES = 200;
function copyString(value) {
    return value.split('').join('');
}
function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code) {
    return code >= 0xdc00 && code <= 0xdfff;
}
function splitSurrogatePairAt(value, index) {
    return (index > 0 &&
        index < value.length &&
        isHighSurrogate(value.charCodeAt(index - 1)) &&
        isLowSurrogate(value.charCodeAt(index)));
}
function safeHeadEnd(value, index) {
    return splitSurrogatePairAt(value, index) ? index - 1 : index;
}
function safeTailStart(value, index) {
    return splitSurrogatePairAt(value, index) ? index + 1 : index;
}
function buildStringCompactionMarker(value, purpose) {
    if (purpose === 'recording') {
        return `\n[... truncated for saved session preview; original length: ${value.length} characters ...]\n`;
    }
    return `\n[... truncated from ${value.length} characters for CLI history display ...]\n`;
}
function buildAnsiOutputCompactionMarker(omitted, purpose) {
    const target = purpose === 'recording' ? 'saved session preview' : 'CLI history display';
    return `[... ${omitted} terminal lines omitted from ${target} ...]`;
}
function compactString(value, purpose, limit = MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS) {
    if (value.length <= limit) {
        return value;
    }
    const marker = buildStringCompactionMarker(value, purpose);
    // The marker is 60-80 characters and was appended whatever the limit was,
    // so a caller-supplied limit below that got back more than it asked for --
    // and for a limit under the input length, more characters than it passed
    // in. `compactStringForRecording('x'.repeat(70), 60)` returned 79. When the
    // marker cannot fit alongside any content there is nothing to announce, so
    // hard-truncate instead of explaining the truncation at greater length than
    // the truncated text.
    if (marker.length >= limit) {
        return copyString(value.slice(0, safeHeadEnd(value, Math.max(0, limit))));
    }
    const contentBudget = Math.max(0, limit - marker.length);
    const headLength = Math.ceil(contentBudget * 0.6);
    const tailLength = contentBudget - headLength;
    const headEnd = safeHeadEnd(value, headLength);
    const tailStart = safeTailStart(value, value.length - tailLength);
    const head = copyString(value.slice(0, headEnd));
    const tail = tailLength > 0 ? copyString(value.slice(tailStart)) : '';
    return head + marker + tail;
}
export function compactStringForHistory(value, limit = MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS) {
    return compactString(value, 'history', limit);
}
export function compactStringForRecording(value, limit = MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS) {
    return compactString(value, 'recording', limit);
}
function isFileDiffDisplay(resultDisplay) {
    if (typeof resultDisplay !== 'object' ||
        resultDisplay === null ||
        !('fileDiff' in resultDisplay) ||
        !('fileName' in resultDisplay) ||
        !('originalContent' in resultDisplay) ||
        !('newContent' in resultDisplay)) {
        return false;
    }
    const display = resultDisplay;
    const originalContent = display['originalContent'];
    return (typeof display['fileDiff'] === 'string' &&
        typeof display['fileName'] === 'string' &&
        typeof display['newContent'] === 'string' &&
        (originalContent === null || typeof originalContent === 'string'));
}
function compactFileDiff(display, purpose) {
    const fileDiffLength = display.fileDiff.length;
    const originalContentLength = typeof display.originalContent === 'string'
        ? display.originalContent.length
        : 0;
    const newContentLength = display.newContent.length;
    const fileDiffTruncated = fileDiffLength > MAX_RETAINED_FILE_DIFF_CHARS;
    const originalContentTruncated = originalContentLength > MAX_RETAINED_FILE_CONTENT_CHARS;
    const newContentTruncated = newContentLength > MAX_RETAINED_FILE_CONTENT_CHARS;
    if (!fileDiffTruncated && !originalContentTruncated && !newContentTruncated) {
        return display;
    }
    return {
        ...display,
        fileDiff: compactString(display.fileDiff, purpose, MAX_RETAINED_FILE_DIFF_CHARS),
        originalContent: typeof display.originalContent === 'string'
            ? compactString(display.originalContent, purpose, MAX_RETAINED_FILE_CONTENT_CHARS)
            : display.originalContent,
        newContent: compactString(display.newContent, purpose, MAX_RETAINED_FILE_CONTENT_CHARS),
        truncatedForSession: true,
        fileDiffLength,
        originalContentLength,
        newContentLength,
        fileDiffTruncated,
        originalContentTruncated,
        newContentTruncated,
    };
}
function isAnsiOutputDisplay(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'ansiOutput' in resultDisplay &&
        Array.isArray(resultDisplay.ansiOutput));
}
function markerAnsiLine(text) {
    return [
        {
            text,
            bold: false,
            italic: false,
            underline: false,
            dim: true,
            inverse: false,
            fg: '',
            bg: '',
        },
    ];
}
function compactAnsiLine(line, purpose) {
    let changed = false;
    const compactedLine = line.map((token) => {
        const compactedText = compactString(token.text, purpose);
        if (compactedText !== token.text) {
            changed = true;
            return {
                ...token,
                text: compactedText,
            };
        }
        return token;
    });
    return changed ? compactedLine : line;
}
function compactAnsiOutput(output, purpose) {
    if (output.length <= MAX_RETAINED_ANSI_OUTPUT_LINES) {
        let changed = false;
        const compactedOutput = output.map((line) => {
            const compactedLine = compactAnsiLine(line, purpose);
            if (compactedLine !== line) {
                changed = true;
            }
            return compactedLine;
        });
        return changed ? compactedOutput : output;
    }
    const omitted = output.length - MAX_RETAINED_ANSI_OUTPUT_LINES + 1;
    return [
        markerAnsiLine(buildAnsiOutputCompactionMarker(omitted, purpose)),
        ...output
            .slice(-(MAX_RETAINED_ANSI_OUTPUT_LINES - 1))
            .map((line) => compactAnsiLine(line, purpose)),
    ];
}
function compactAnsiOutputDisplay(display, purpose) {
    const ansiOutput = compactAnsiOutput(display.ansiOutput, purpose);
    if (ansiOutput === display.ansiOutput) {
        return display;
    }
    return {
        ...display,
        ansiOutput,
    };
}
function isAgentResultDisplay(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'type' in resultDisplay &&
        resultDisplay.type === 'task_execution');
}
function compactAgentResultDisplay(display, purpose) {
    return {
        ...display,
        taskDescription: compactString(display.taskDescription, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
        taskPrompt: compactString(display.taskPrompt, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
        ...(display.terminateReason !== undefined && {
            terminateReason: compactString(display.terminateReason, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
        }),
        ...(display.result !== undefined && {
            result: compactString(display.result, purpose, MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS),
        }),
        ...(display.toolCalls !== undefined && {
            toolCalls: display.toolCalls.map((toolCall) => {
                const { args: _args, responseParts: _responseParts, result: _result, resultDisplay, error, description, ...rest } = toolCall;
                return {
                    ...rest,
                    ...(description !== undefined && {
                        description: compactString(description, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
                    }),
                    ...(error !== undefined && {
                        error: compactString(error, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
                    }),
                    ...(resultDisplay !== undefined && {
                        resultDisplay: compactString(resultDisplay, purpose),
                    }),
                };
            }),
        }),
    };
}
function isTodoResultDisplay(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'type' in resultDisplay &&
        resultDisplay.type === 'todo_list');
}
function compactTodoResultDisplay(display, purpose) {
    return {
        ...display,
        todos: display.todos.map((todo) => ({
            ...todo,
            content: compactString(todo.content, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
        })),
    };
}
function isPlanResultDisplay(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'type' in resultDisplay &&
        resultDisplay.type === 'plan_summary');
}
function compactPlanResultDisplay(display, purpose) {
    return {
        ...display,
        message: compactString(display.message, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
        plan: compactString(display.plan, purpose, MAX_RETAINED_TOOL_RESULT_DISPLAY_CHARS),
    };
}
function isMcpToolProgressData(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'type' in resultDisplay &&
        resultDisplay.type === 'mcp_tool_progress');
}
function compactMcpToolProgressData(display, purpose) {
    return {
        ...display,
        ...(display.message !== undefined && {
            message: compactString(display.message, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
        }),
    };
}
function isTeamResultDisplay(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'type' in resultDisplay &&
        resultDisplay.type === 'team_result');
}
function compactTeamResultDisplay(display, purpose) {
    return {
        ...display,
        teamName: compactString(display.teamName, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
    };
}
function isTaskListResultDisplay(resultDisplay) {
    return (typeof resultDisplay === 'object' &&
        resultDisplay !== null &&
        'type' in resultDisplay &&
        resultDisplay.type === 'task_list');
}
function compactTaskListResultDisplay(display, purpose) {
    return {
        ...display,
        tasks: display.tasks.map((task) => ({
            ...task,
            subject: compactString(task.subject, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
            ...(task.owner !== undefined && {
                owner: compactString(task.owner, purpose, MAX_RETAINED_AGENT_FIELD_CHARS),
            }),
        })),
    };
}
function compactToolResultDisplay(resultDisplay, purpose) {
    if (typeof resultDisplay === 'string') {
        return compactString(resultDisplay, purpose);
    }
    if (resultDisplay === undefined) {
        return resultDisplay;
    }
    if (isFileDiffDisplay(resultDisplay)) {
        return compactFileDiff(resultDisplay, purpose);
    }
    if (isAgentResultDisplay(resultDisplay)) {
        return compactAgentResultDisplay(resultDisplay, purpose);
    }
    if (isAnsiOutputDisplay(resultDisplay)) {
        return compactAnsiOutputDisplay(resultDisplay, purpose);
    }
    if (isTodoResultDisplay(resultDisplay)) {
        return compactTodoResultDisplay(resultDisplay, purpose);
    }
    if (isPlanResultDisplay(resultDisplay)) {
        return compactPlanResultDisplay(resultDisplay, purpose);
    }
    if (isMcpToolProgressData(resultDisplay)) {
        return compactMcpToolProgressData(resultDisplay, purpose);
    }
    if (isTeamResultDisplay(resultDisplay)) {
        return compactTeamResultDisplay(resultDisplay, purpose);
    }
    if (isTaskListResultDisplay(resultDisplay)) {
        return compactTaskListResultDisplay(resultDisplay, purpose);
    }
    return resultDisplay;
}
export function compactToolResultDisplayForHistory(resultDisplay) {
    return compactToolResultDisplay(resultDisplay, 'history');
}
export function compactToolResultDisplayForRecording(resultDisplay) {
    return compactToolResultDisplay(resultDisplay, 'recording');
}
//# sourceMappingURL=toolResultDisplayCompaction.js.map