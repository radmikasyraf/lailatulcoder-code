/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { LOAD_REPLAY_META_KEY } from '@lailatul-coder/acp-bridge/bridgeTypes';
import { observeToolResultBoundary, } from '@lailatul-coder/lailatul-coder-core';
const acpUpdateArtifacts = new WeakMap();
const projectedAcpUpdates = new WeakMap();
const projectedHeadlessMessages = new WeakMap();
export function associateAcpToolResultArtifact(update, artifact) {
    if (isObject(update))
        acpUpdateArtifacts.set(update, artifact);
}
export function observeAcpToolResultProjection(input, output, sessionId, wireUpdate = output) {
    try {
        if (isObject(wireUpdate) && projectedAcpUpdates.has(wireUpdate))
            return;
        const mutated = input !== output;
        const artifact = acpUpdateArtifacts.get(input) ?? {
            state: 'undecided',
            kinds: [],
        };
        const common = { sessionId, toolCallId: toolCallId(input) };
        const inputEligible = observeToolResultBoundary({
            stage: 'acp_projection_input',
            ...common,
            mutated,
            artifacts: [artifact],
            values: () => acpToolResultValues(input),
        });
        const outputEligible = observeToolResultBoundary({
            stage: 'acp_projection_output',
            ...common,
            mutated,
            artifacts: [artifact],
            values: () => acpToolResultValues(output),
        });
        if ((inputEligible || outputEligible) && isObject(wireUpdate)) {
            projectedAcpUpdates.set(wireUpdate, { mutated, artifact, sessionId });
        }
    }
    catch {
        // Diagnostics must not affect projection or delivery.
    }
}
export function observeAcpToolResultWire(message, payloadUtf8Bytes) {
    try {
        const record = asRecord(message);
        if (!record)
            return;
        const updates = acpWireUpdates(record).flatMap((update) => {
            const projection = projectedAcpUpdates.get(update);
            return projection ? [{ update, projection }] : [];
        });
        if (updates.length === 0)
            return;
        const params = asRecord(record['params']);
        const projectionSessionIds = new Set(updates.map(({ projection }) => projection.sessionId));
        const toolCallIds = updates.flatMap(({ update }) => {
            const id = toolCallId(update);
            return id === undefined ? [] : [id];
        });
        observeToolResultBoundary({
            stage: 'acp_wire',
            sessionId: typeof params?.['sessionId'] === 'string'
                ? params['sessionId']
                : projectionSessionIds.size === 1
                    ? projectionSessionIds.values().next().value
                    : undefined,
            toolCallId: updates.length === 1 ? toolCallId(updates[0].update) : undefined,
            ...(updates.length > 1 ? { toolCallIds } : {}),
            wireUtf8Bytes: payloadUtf8Bytes + 1,
            mutated: updates.some(({ projection }) => projection.mutated),
            artifacts: updates.map(({ projection }) => projection.artifact),
            values: () => updates.flatMap(({ update }) => acpToolResultValues(update)),
        });
        for (const { update } of updates)
            projectedAcpUpdates.delete(update);
    }
    catch {
        // Diagnostics must not affect the writer hook.
    }
}
export function observeHeadlessToolResultProjection(message, inputContent, outputContent, toolCallId, artifact) {
    try {
        const mutated = inputContent !== outputContent;
        const inputEligible = observeToolResultBoundary({
            stage: 'headless_projection_input',
            sessionId: message.session_id,
            toolCallId,
            mutated,
            artifacts: [artifact],
            values: [{ representation: 'headless_content', value: inputContent }],
        });
        const outputEligible = observeToolResultBoundary({
            stage: 'headless_projection_output',
            sessionId: message.session_id,
            toolCallId,
            mutated,
            artifacts: [artifact],
            values: [{ representation: 'headless_content', value: outputContent }],
        });
        if (inputEligible || outputEligible) {
            projectedHeadlessMessages.set(message, {
                mutated,
                artifact,
                sessionId: message.session_id,
            });
        }
    }
    catch {
        // Diagnostics must not affect projection or delivery.
    }
}
export function observeHeadlessToolResultWire(message, frame) {
    try {
        if (!projectedHeadlessMessages.has(message))
            return;
        const projection = projectedHeadlessMessages.get(message);
        const toolResults = headlessToolResults(message);
        const values = toolResults.flatMap(toolResultValues);
        observeToolResultBoundary({
            stage: 'headless_wire',
            sessionId: message.session_id,
            toolCallId: toolResults.length === 1 &&
                typeof toolResults[0].tool_use_id === 'string'
                ? toolResults[0].tool_use_id
                : undefined,
            ...(toolResults.length > 1
                ? {
                    toolCallIds: toolResults.map((toolResult) => toolResult.tool_use_id),
                }
                : {}),
            wireUtf8Bytes: Buffer.byteLength(frame, 'utf8'),
            mutated: projection.mutated,
            artifacts: [projection.artifact],
            values,
        });
        projectedHeadlessMessages.delete(message);
    }
    catch {
        // Diagnostics must not affect the writer.
    }
}
export function observeHeadlessJsonToolResultWire(messages, frame) {
    try {
        const observedMessages = messages.filter((message) => projectedHeadlessMessages.has(message));
        if (observedMessages.length === 0)
            return;
        const toolResults = observedMessages.flatMap(headlessToolResults);
        const values = toolResults.flatMap(toolResultValues);
        observeToolResultBoundary({
            stage: 'headless_wire',
            sessionId: new Set(observedMessages.map((message) => message.session_id)).size ===
                1
                ? observedMessages[0].session_id
                : undefined,
            toolCallId: toolResults.length === 1 ? toolResults[0].tool_use_id : undefined,
            ...(toolResults.length > 1
                ? {
                    toolCallIds: toolResults.map((toolResult) => toolResult.tool_use_id),
                }
                : {}),
            wireUtf8Bytes: Buffer.byteLength(frame, 'utf8'),
            mutated: observedMessages.some((message) => projectedHeadlessMessages.get(message)?.mutated === true),
            artifacts: observedMessages.map((message) => projectedHeadlessMessages.get(message).artifact),
            values,
        });
        for (const message of observedMessages) {
            projectedHeadlessMessages.delete(message);
        }
    }
    catch {
        // Diagnostics must not affect the writer.
    }
}
function acpToolResultValues(update) {
    const record = update;
    if (record['sessionUpdate'] !== 'tool_call_update')
        return [];
    const values = [];
    const content = record['content'];
    if (Array.isArray(content)) {
        for (const block of content) {
            const text = asRecord(asRecord(block)?.['content'])?.['text'];
            if (typeof text === 'string') {
                values.push({ representation: 'acp_content', value: text });
            }
        }
    }
    if (typeof record['rawOutput'] === 'string') {
        values.push({
            representation: 'acp_raw_output',
            value: record['rawOutput'],
        });
    }
    return values;
}
function toolCallId(value) {
    const id = asRecord(value)?.['toolCallId'];
    return typeof id === 'string' ? id : undefined;
}
function acpWireUpdates(message) {
    if (message['method'] === 'session/update') {
        const update = asRecord(asRecord(message['params'])?.['update']);
        return update ? [update] : [];
    }
    const result = asRecord(message['result']);
    const replay = asRecord(asRecord(result?.['_meta'])?.[LOAD_REPLAY_META_KEY]);
    const candidates = replay?.['updates'] ?? result?.['updates'];
    if (Array.isArray(candidates))
        return candidates.filter(isObject);
    const events = result?.['events'];
    return Array.isArray(events)
        ? events.flatMap((event) => {
            const update = asRecord(event)?.['data'];
            return isObject(update) ? [update] : [];
        })
        : [];
}
function headlessToolResults(message) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
        return [];
    }
    return message.message.content.flatMap((block) => block.type === 'tool_result' ? [block] : []);
}
function toolResultValues(toolResult) {
    return typeof toolResult.content === 'string'
        ? [{ representation: 'headless_content', value: toolResult.content }]
        : [];
}
function asRecord(value) {
    return isObject(value) ? value : undefined;
}
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
//# sourceMappingURL=tool-result-boundary-diagnostics.js.map