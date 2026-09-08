/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Per-agent transcript for background subagents.
 *
 * Each background subagent produces two sibling files under
 * `<projectDir>/subagents/<sessionId>/`:
 *
 *   agent-<id>.jsonl       — canonical, ChatRecord-shaped event log;
 *                            the model reads this via read_file to check
 *                            in-flight progress and <output-file> in the
 *                            notification XML points here
 *   agent-<id>.meta.json   — sidecar with agentType, description, parent
 *                            session/agent IDs, createdAt
 *   agent-<id>.jsonl.stream — transient live text, removed when the writer
 *                            closes
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentEventType, } from './runtime/agent-events.js';
import { MAX_SUBAGENT_DEPTH_LIMIT } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { getCachedGitBranch } from '../utils/gitUtils.js';
import { _recoverObjectsFromLine } from '../utils/jsonl-utils.js';
const debugLogger = createDebugLogger('AGENT_TRANSCRIPT');
const MAX_PENDING_STREAM_BYTES = 64 * 1024;
export function sanitizeFilenameComponent(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}
/** Root dir holding every session's subagent transcripts: `<projectDir>/subagents/`. */
export function getSubagentsRootDir(projectDir) {
    return path.join(projectDir, 'subagents');
}
/**
 * Returns the directory holding all subagent transcripts for a given session.
 * Layout: `<projectDir>/subagents/<sessionId>/`.
 *
 * TODO: this path is part of the model-facing contract via `<output-file>` in
 * the task-notification XML. When a second background task kind lands (e.g. a
 * shell pool), migrate to `<projectDir>/tasks/<sessionId>/<kind>-<id>.jsonl`
 * so the namespace generalizes. Update `read-file.ts` auto-allow accordingly.
 */
export function getSubagentSessionDir(projectDir, sessionId) {
    // Sanitize sessionId defensively (UUIDs are safe; resumed/external IDs
    // could carry path-traversal bytes).
    return path.join(getSubagentsRootDir(projectDir), sanitizeFilenameComponent(sessionId));
}
/** Returns the canonical JSONL transcript path. */
export function getAgentJsonlPath(projectDir, sessionId, agentId) {
    return path.join(getSubagentSessionDir(projectDir, sessionId), `agent-${sanitizeFilenameComponent(agentId)}.jsonl`);
}
/** Returns the sidecar metadata file path. */
export function getAgentMetaPath(projectDir, sessionId, agentId) {
    return path.join(getSubagentSessionDir(projectDir, sessionId), `agent-${sanitizeFilenameComponent(agentId)}.meta.json`);
}
/**
 * Normalizes a persisted launch depth read from an agent sidecar before it
 * is pinned via the `runWithAgentContext` depthOverride. The sidecar is a
 * plain JSON file, so a malformed or hand-edited value must not mint spawn
 * capacity: a negative depth (or `-1e309`, which parses to -Infinity) would
 * make `canSpawnNestedAgent()` pass for every cap.
 *
 * Absent values return undefined (the resume frame derives its depth as a
 * fresh launch). Anything but an integer within 0–{@link
 * MAX_SUBAGENT_DEPTH_LIMIT} fails CLOSED to the limit: the resumed agent
 * keeps running but cannot spawn — clamping a corrupt value down to 0 would
 * fail open by granting full spawn capacity.
 */
export function normalizeResumedAgentDepth(value) {
    if (value == null)
        return undefined;
    return Number.isInteger(value) &&
        value >= 0 &&
        value <= MAX_SUBAGENT_DEPTH_LIMIT
        ? value
        : MAX_SUBAGENT_DEPTH_LIMIT;
}
/**
 * Best-effort — a failed sidecar write must not break the agent launch path.
 */
export function writeAgentMeta(metaPath, meta) {
    try {
        fs.mkdirSync(path.dirname(metaPath), { recursive: true });
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    }
    catch (error) {
        debugLogger.warn(`Failed to write agent meta sidecar ${metaPath}:`, error);
        return;
    }
    try {
        const now = new Date();
        fs.utimesSync(path.dirname(metaPath), now, now);
    }
    catch (error) {
        debugLogger.warn(`Failed to refresh agent session directory for ${metaPath}:`, error);
    }
}
export function readAgentMeta(metaPath) {
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            debugLogger.warn(`Failed to read agent meta sidecar ${metaPath}:`, error);
        }
        return undefined;
    }
}
export function patchAgentMeta(metaPath, updates) {
    const current = readAgentMeta(metaPath);
    if (!current)
        return undefined;
    const next = {
        ...current,
        ...updates,
    };
    writeAgentMeta(metaPath, next);
    return next;
}
export function readLastTranscriptRecordUuidSync(jsonlPath) {
    try {
        const raw = fs.readFileSync(jsonlPath, 'utf8');
        const lines = raw.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const trimmed = lines[i]?.trim();
            if (!trimmed)
                continue;
            try {
                const parsed = JSON.parse(trimmed);
                return parsed.uuid ?? null;
            }
            catch {
                const recovered = _recoverObjectsFromLine(trimmed);
                const lastRecovered = recovered[recovered.length - 1];
                if (lastRecovered?.uuid) {
                    return lastRecovered.uuid;
                }
            }
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            debugLogger.warn(`Failed to read last transcript record UUID from ${jsonlPath}:`, error);
        }
    }
    return null;
}
/**
 * Single owner of the agent-transcript attach contract: the JSONL path plus
 * the launch metadata shared by every attach site (AgentTool's foreground
 * and background launches, workflow dispatch, background resume). Each site
 * layers its extras on top, so a new launch-metadata field added here lands
 * in every transcript instead of only the sites that happened to be updated.
 *
 * The path follows the merged `sessionId` — the live session by default;
 * background resume overrides it with the persisted parent session.
 */
export function buildAgentTranscriptAttach(config, agentId, extras) {
    const projectRoot = config.getProjectRoot();
    const options = {
        agentId,
        sessionId: config.getSessionId(),
        cwd: projectRoot,
        version: config.getCliVersion() || 'unknown',
        gitBranch: getCachedGitBranch(projectRoot),
        ...extras,
    };
    return {
        jsonlPath: getAgentJsonlPath(config.storage.getProjectDir(), options.sessionId, options.agentId),
        options,
    };
}
/**
 * Subscribes to an AgentEventEmitter and appends ChatRecord-shaped JSONL
 * lines to `jsonlPath`. Maintains a parentUuid chain so consumers can walk
 * the transcript tree the same way they walk the main session log.
 *
 * Holds a single append-mode fd for the lifetime of the writer so streaming
 * tools (which can fire many TOOL_CALL events per round) avoid
 * an open+write+close syscall storm. The fd is opened lazily on the first
 * write so callers that attach but never produce a record don't materialize
 * an empty file.
 */
export function attachJsonlTranscriptWriter(emitter, jsonlPath, options) {
    let lastUuid = options.initialParentUuid !== undefined
        ? options.initialParentUuid
        : options.appendToExisting
            ? readLastTranscriptRecordUuidSync(jsonlPath)
            : null;
    let fd = null;
    let streamFd = null;
    const streamPath = `${jsonlPath}.stream`;
    const streamRunId = randomUUID();
    let pendingStreamText = '';
    let pendingStreamBytes = 0;
    let streamFlushTimer = null;
    let openFailed = false;
    try {
        fs.rmSync(streamPath, { force: true });
    }
    catch (error) {
        debugLogger.warn(`Failed to reset streaming transcript ${streamPath}:`, error);
    }
    const ensureOpen = () => {
        if (fd !== null)
            return true;
        if (openFailed)
            return false;
        try {
            fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
            fd = fs.openSync(jsonlPath, 'a');
            return true;
        }
        catch (error) {
            debugLogger.warn(`Failed to open JSONL transcript ${jsonlPath}:`, error);
            openFailed = true;
            return false;
        }
    };
    const baseFields = (type) => ({
        uuid: randomUUID(),
        parentUuid: lastUuid,
        sessionId: options.sessionId,
        timestamp: new Date().toISOString(),
        type,
        cwd: options.cwd,
        version: options.version,
        gitBranch: options.gitBranch,
        agentId: options.agentId,
        agentName: options.agentName,
        agentColor: options.agentColor,
        isSidechain: true,
    });
    const append = (record) => {
        if (!ensureOpen())
            return;
        try {
            fs.writeSync(fd, JSON.stringify(record) + '\n');
            lastUuid = record.uuid;
        }
        catch (error) {
            debugLogger.warn(`Failed to append JSONL record to ${jsonlPath}:`, error);
        }
    };
    const flushStreamText = () => {
        streamFlushTimer = null;
        if (!pendingStreamText)
            return;
        const text = pendingStreamText;
        pendingStreamText = '';
        pendingStreamBytes = 0;
        try {
            if (streamFd === null) {
                fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
                streamFd = fs.openSync(streamPath, 'w');
            }
            fs.writeSync(streamFd, text);
        }
        catch (error) {
            debugLogger.warn(`Failed to append streaming transcript ${streamPath}:`, error);
        }
    };
    const appendStreamText = (event) => {
        const record = `${JSON.stringify({
            v: 1,
            runId: event.runId ?? streamRunId,
            round: event.round,
            text: event.text,
            thought: event.thought === true,
            timestamp: event.timestamp,
        })}\n`;
        pendingStreamText += record;
        pendingStreamBytes += Buffer.byteLength(record);
        if (pendingStreamBytes >= MAX_PENDING_STREAM_BYTES) {
            if (streamFlushTimer !== null) {
                clearTimeout(streamFlushTimer);
                streamFlushTimer = null;
            }
            flushStreamText();
            return;
        }
        if (streamFlushTimer === null) {
            streamFlushTimer = setTimeout(flushStreamText, 100);
            streamFlushTimer.unref();
        }
    };
    const onRoundText = (event) => {
        const parts = [
            ...(event.thoughtText
                ? [{ text: event.thoughtText, thought: true }]
                : []),
            ...(event.text ? [{ text: event.text }] : []),
        ];
        if (parts.length === 0 && !event.usageMetadata)
            return;
        append({
            ...baseFields('assistant'),
            message: { role: 'model', parts },
            usageMetadata: event.usageMetadata,
            agentRunId: event.runId ?? streamRunId,
            agentRound: event.round,
        });
    };
    const onToolCall = (event) => {
        append({
            ...baseFields('assistant'),
            message: {
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            id: event.callId,
                            name: event.name,
                            args: event.args,
                        },
                    },
                ],
            },
        });
    };
    const onToolResponsesFinalized = (event) => {
        for (const response of event.responses) {
            append({
                ...baseFields('tool_result'),
                message: { role: 'user', parts: response.responseParts },
                toolCallResult: {
                    callId: response.callId,
                    ...(response.durationMs !== undefined
                        ? { durationMs: response.durationMs }
                        : {}),
                },
            });
        }
    };
    const recordUserMessage = (text, externalInputKind) => {
        if (!text)
            return;
        append({
            ...baseFields('user'),
            message: { role: 'user', parts: [{ text }] },
            ...(externalInputKind ? { externalInputKind } : {}),
        });
    };
    const recordSystem = (subtype, payload) => {
        append({
            ...baseFields('system'),
            subtype,
            systemPayload: payload,
        });
    };
    const onExternalMessage = (event) => {
        recordUserMessage(event.text, event.kind ?? 'message');
    };
    if (options.bootstrapHistory !== undefined) {
        const payload = {
            kind: 'fork',
            history: structuredClone(options.bootstrapHistory ?? []),
        };
        recordSystem('agent_bootstrap', payload);
    }
    if (options.initialUserPrompt) {
        recordUserMessage(options.initialUserPrompt);
    }
    if (options.launchTaskPrompt) {
        recordSystem('agent_launch_prompt', {
            displayText: options.launchTaskPrompt,
        });
    }
    if (options.retryAttempt !== undefined) {
        recordSystem('agent_retry', { attempt: options.retryAttempt });
    }
    emitter.on(AgentEventType.ROUND_TEXT, onRoundText);
    emitter.on(AgentEventType.STREAM_TEXT, appendStreamText);
    emitter.on(AgentEventType.TOOL_CALL, onToolCall);
    emitter.on(AgentEventType.TOOL_RESPONSES_FINALIZED, onToolResponsesFinalized);
    emitter.on(AgentEventType.EXTERNAL_MESSAGE, onExternalMessage);
    const cleanup = () => {
        emitter.off(AgentEventType.ROUND_TEXT, onRoundText);
        emitter.off(AgentEventType.STREAM_TEXT, appendStreamText);
        emitter.off(AgentEventType.TOOL_CALL, onToolCall);
        emitter.off(AgentEventType.TOOL_RESPONSES_FINALIZED, onToolResponsesFinalized);
        emitter.off(AgentEventType.EXTERNAL_MESSAGE, onExternalMessage);
        if (streamFlushTimer !== null) {
            clearTimeout(streamFlushTimer);
            streamFlushTimer = null;
        }
        flushStreamText();
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            }
            catch {
                // best effort
            }
            fd = null;
        }
        if (streamFd !== null) {
            try {
                fs.closeSync(streamFd);
            }
            catch {
                // Best-effort cleanup; the process will release the descriptor.
            }
            streamFd = null;
        }
        try {
            fs.rmSync(streamPath, { force: true });
        }
        catch (error) {
            debugLogger.warn(`Failed to remove streaming transcript ${streamPath}:`, error);
        }
    };
    return { cleanup };
}
//# sourceMappingURL=agent-transcript.js.map