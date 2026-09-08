/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';
import { createDebugLogger, isDebugLogFileEnabled, } from './debugLogger.js';
import { promptIdContext } from './promptIdContext.js';
import { sessionIdContext } from './sessionIdContext.js';
import { canonicalToolName } from '../tools/tool-names.js';
export const TOOL_RESULT_BOUNDARY_EVENT_NAME = 'lailatul-coder.tool_result.boundary';
export const TOOL_RESULT_BOUNDARY_JSON_BYTE_THRESHOLD = 65_536;
export const TOOL_RESULT_BOUNDARY_LOG_LIMIT = 50;
export const TOOL_RESULT_BOUNDARY_LOG_WINDOW_MS = 60_000;
const boundaryLogger = createDebugLogger('TOOL_RESULT_BOUNDARY');
const artifactKindRecord = {
    file: true,
    link: true,
    html: true,
    image: true,
    video: true,
    audio: true,
    pdf: true,
    notebook: true,
    document: true,
    other: true,
};
const artifactKinds = new Set(Object.keys(artifactKindRecord));
export function isToolResultBoundaryDiagnosticsEnabled() {
    try {
        return isDebugLogFileEnabled() && boundaryLogger.isEnabled();
    }
    catch {
        return false;
    }
}
export function toolResultArtifactState(persistedOutputFiles) {
    if (persistedOutputFiles === undefined)
        return 'undecided';
    return persistedOutputFiles.length === 0 ? 'none' : 'reusable';
}
export function toolResultBoundaryArtifact(persistedOutputFiles, artifacts) {
    try {
        const kinds = new Set();
        if (persistedOutputFiles && persistedOutputFiles.length > 0) {
            kinds.add('file');
        }
        for (const artifact of artifacts ?? []) {
            const kind = artifact.kind;
            kinds.add(typeof kind === 'string' && artifactKinds.has(kind)
                ? kind
                : 'unknown');
        }
        return {
            state: toolResultArtifactState(persistedOutputFiles),
            kinds: [...kinds],
        };
    }
    catch {
        return { state: 'undecided', kinds: [] };
    }
}
export function toolResultPartDiagnosticValues(value) {
    const values = [];
    const parts = Array.isArray(value) ? value : [value ?? ''];
    for (const candidate of parts) {
        if (typeof candidate === 'string') {
            values.push({ representation: 'model_text', value: candidate });
            continue;
        }
        const part = candidate;
        if (typeof part.text === 'string') {
            values.push({ representation: 'model_text', value: part.text });
        }
        const response = part.functionResponse?.response;
        const output = response?.['output'];
        const error = response?.['error'];
        if (typeof output === 'string') {
            values.push({ representation: 'model_text', value: output });
        }
        if (typeof error === 'string') {
            values.push({ representation: 'model_text', value: error });
        }
    }
    return values;
}
export function createToolResultBoundaryObserver(options = {}) {
    const logger = options.logger ?? boundaryLogger;
    const enabled = options.enabled ??
        (logger === boundaryLogger
            ? isToolResultBoundaryDiagnosticsEnabled
            : () => isDebugLogFileEnabled() && logger.isEnabled());
    let hmacKey = options.hmacKey ? Buffer.from(options.hmacKey) : undefined;
    const thresholdBytes = options.thresholdBytes ?? TOOL_RESULT_BOUNDARY_JSON_BYTE_THRESHOLD;
    const logLimit = options.logLimit ?? TOOL_RESULT_BOUNDARY_LOG_LIMIT;
    const windowMs = options.windowMs ?? TOOL_RESULT_BOUNDARY_LOG_WINDOW_MS;
    const now = options.now ?? Date.now;
    let windowStartedAt = now();
    let emittedInWindow = 0;
    let suppressedCount = 0;
    return (observation) => {
        try {
            if (!enabled())
                return false;
            const mutated = typeof observation.mutated === 'function'
                ? observation.mutated()
                : observation.mutated === true;
            const currentTime = now();
            if (currentTime < windowStartedAt ||
                currentTime - windowStartedAt >= windowMs) {
                windowStartedAt = currentTime;
                emittedInWindow = 0;
            }
            if (mutated && emittedInWindow >= logLimit) {
                suppressedCount++;
                return true;
            }
            const values = typeof observation.values === 'function'
                ? observation.values()
                : observation.values;
            const oversized = !mutated &&
                values.some(({ value }) => jsonStringExceedsByteLength(value, thresholdBytes));
            if (!mutated && !oversized)
                return false;
            if (emittedInWindow >= logLimit) {
                suppressedCount++;
                return true;
            }
            const measuredValues = measureValues(values);
            hmacKey ??= randomBytes(32);
            const activeHmacKey = hmacKey;
            const valueHmacs = new Map();
            const summaries = measuredValues.map(({ value, ...summary }) => {
                let hmacSha256 = valueHmacs.get(value);
                if (hmacSha256 === undefined) {
                    hmacSha256 = hmacString(value, activeHmacKey);
                    valueHmacs.set(value, hmacSha256);
                }
                return { ...summary, hmacSha256 };
            });
            const event = {
                eventName: TOOL_RESULT_BOUNDARY_EVENT_NAME,
                stage: observation.stage,
                mutated,
                values: summaries,
                ...(observation.artifacts !== undefined
                    ? {
                        artifacts: observation.artifacts.map((artifact) => ({
                            state: artifact.state === 'none' || artifact.state === 'reusable'
                                ? artifact.state
                                : 'undecided',
                            kinds: [
                                ...new Set(artifact.kinds.map((kind) => kind === 'unknown' || artifactKinds.has(kind)
                                    ? kind
                                    : 'unknown')),
                            ],
                        })),
                    }
                    : {}),
                ...hmacIdentifier('sessionHmacSha256', observation.sessionId, activeHmacKey),
                ...hmacIdentifier('promptHmacSha256', observation.promptId, activeHmacKey),
                ...hmacIdentifier('toolCallHmacSha256', observation.toolCallId, activeHmacKey),
                ...(observation.toolCallIds !== undefined
                    ? {
                        toolCallHmacSha256s: observation.toolCallIds.map((id) => hmacString(id, activeHmacKey)),
                    }
                    : {}),
                ...hmacIdentifier('toolNameHmacSha256', observation.toolName === undefined
                    ? undefined
                    : canonicalToolName(observation.toolName), activeHmacKey),
                ...(observation.wireUtf8Bytes !== undefined
                    ? { wireUtf8Bytes: observation.wireUtf8Bytes }
                    : {}),
                ...(suppressedCount > 0 ? { suppressedCount } : {}),
            };
            suppressedCount = 0;
            emittedInWindow++;
            logger.debug(`${TOOL_RESULT_BOUNDARY_EVENT_NAME} ${JSON.stringify(event)}`);
            return true;
        }
        catch {
            return false;
        }
    };
}
const observeBoundary = createToolResultBoundaryObserver();
export function observeToolResultBoundary(observation) {
    return observeBoundary({
        ...observation,
        sessionId: observation.sessionId ?? sessionIdContext.getStore(),
        promptId: observation.promptId ?? promptIdContext.getStore(),
    });
}
function measureValues(values) {
    const slots = new Map();
    const measurements = new Map();
    return values.map(({ representation, value }) => {
        const slot = slots.get(representation) ?? 0;
        slots.set(representation, slot + 1);
        const measurement = measurements.get(value) ?? {
            codeUnits: value.length,
            rawUtf8Bytes: Buffer.byteLength(value, 'utf8'),
            jsonUtf8Bytes: jsonStringByteLength(value),
        };
        measurements.set(value, measurement);
        return {
            representation,
            slot,
            ...measurement,
            value,
        };
    });
}
function hmacIdentifier(key, value, hmacKey) {
    return value === undefined
        ? {}
        : { [key]: hmacString(value, hmacKey) };
}
function hmacString(value, hmacKey) {
    const byteLength = value.length * 2;
    const prefix = Buffer.alloc(8);
    prefix.writeBigUInt64BE(BigInt(byteLength));
    return createHmac('sha256', hmacKey)
        .update(prefix)
        .update(value, 'utf16le')
        .digest('hex');
}
function jsonStringByteLength(value, stopAfterBytes = Number.POSITIVE_INFINITY) {
    let bytes = 2;
    for (let index = 0; index < value.length && bytes <= stopAfterBytes; index++) {
        const code = value.charCodeAt(index);
        if (code === 0x22 || code === 0x5c) {
            bytes += 2;
        }
        else if (code <= 0x1f) {
            bytes +=
                code === 0x08 ||
                    code === 0x09 ||
                    code === 0x0a ||
                    code === 0x0c ||
                    code === 0x0d
                    ? 2
                    : 6;
        }
        else if (code <= 0x7f) {
            bytes += 1;
        }
        else if (code <= 0x7ff) {
            bytes += 2;
        }
        else if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                bytes += 4;
                index++;
            }
            else {
                bytes += 6;
            }
        }
        else if (code >= 0xdc00 && code <= 0xdfff) {
            bytes += 6;
        }
        else {
            bytes += 3;
        }
    }
    return bytes;
}
function jsonStringExceedsByteLength(value, threshold) {
    return jsonStringByteLength(value, threshold) > threshold;
}
//# sourceMappingURL=tool-result-boundary-diagnostics.js.map