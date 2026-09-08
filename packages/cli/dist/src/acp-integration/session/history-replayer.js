/**
 * @license
 * Copyright 2025 LailatulCoder
 * SPDX-License-Identifier: Apache-2.0
 */
import { parseGoalSnapshotV2, parseGoalStateCause, projectGoalStateToLegacy, } from '@lailatul-coder/lailatul-coder-core';
import { createTranscriptReplayMachine, MISSING_TRANSCRIPT_TOOL_RESULT_MESSAGE, } from '@lailatul-coder/acp-bridge/transcriptReplay';
import { buildToolResultContentPrefix, ToolCallEmitter, } from './emitters/tool-call-emitter.js';
import { formatHistoryGapNotice } from '../../ui/utils/history-gap-notice.js';
import { writeStderrLineSafe } from '../../utils/stdioHelpers.js';
export const MISSING_TOOL_RESULT_MESSAGE = MISSING_TRANSCRIPT_TOOL_RESULT_MESSAGE;
/**
 * Handles replaying session history on session load.
 *
 * Uses the unified emitters to ensure consistency with normal flow.
 * This ensures that replayed history looks identical to how it would
 * have appeared during the original session.
 */
export class HistoryReplayer {
    ctx;
    toolCallEmitter;
    machine;
    constructor(ctx) {
        this.ctx = ctx;
        this.toolCallEmitter = new ToolCallEmitter(ctx);
        this.machine = this.createMachine();
    }
    async replay(records, gaps, options = {}) {
        try {
            if (options.goalBootstrap) {
                const update = {
                    sessionUpdate: 'agent_message_chunk',
                    content: { type: 'text', text: '' },
                    _meta: {
                        ...(options.goalBootstrap.goalState
                            ? { goalState: options.goalBootstrap.goalState }
                            : {}),
                        goalStatus: options.goalBootstrap.goalStatus,
                    },
                };
                await this.sendUpdate(update);
            }
            await this.replayPage(records, {
                finalizeDangling: true,
                gaps,
                ...(options.initialGoalState
                    ? { goalState: options.initialGoalState }
                    : {}),
                ...(options.initialGoalCause
                    ? { goalCause: options.initialGoalCause }
                    : {}),
            });
        }
        finally {
            this.setActiveRecordId(null);
        }
    }
    static v2GoalBootstrap(rawGoalState, rawGoalCause) {
        const goalState = parseGoalSnapshotV2(rawGoalState);
        const goalCause = parseGoalStateCause(rawGoalCause);
        if (!goalState?.goal || goalState.goal.status !== 'active' || !goalCause) {
            return undefined;
        }
        const projection = projectGoalStateToLegacy({
            v: 2,
            cause: goalCause,
            snapshot: goalState,
        });
        const { type: _type, kind, ...goalStatus } = projection.goalStatus;
        if (kind !== 'set' && kind !== 'checking') {
            return undefined;
        }
        return { goalStatus: { ...goalStatus, kind }, goalState };
    }
    async replayPage(records, options = {}) {
        this.machine = this.createMachine(options);
        let replayError;
        try {
            for (const record of records) {
                for (const emission of this.machine.project(record)) {
                    this.setActiveRecordId(emission.sourceRecordId, emission.sourceTimestamp);
                    await this.sendUpdate(emission.update);
                }
            }
        }
        catch (error) {
            replayError = error;
        }
        let danglingError;
        if (options.finalizeDangling === true) {
            for (const emission of this.machine.finalize()) {
                this.setActiveRecordId(emission.sourceRecordId, emission.sourceTimestamp);
                try {
                    await this.sendUpdate(emission.update);
                }
                catch (error) {
                    danglingError ??= error;
                }
            }
        }
        const replay = this.machine.snapshot();
        this.copyCumulativeUsage(replay);
        const state = {
            pendingToolCalls: options.finalizeDangling === true
                ? []
                : replay.pendingToolCalls.map(toLegacyPendingToolCall),
            replay,
        };
        this.setActiveRecordId(null);
        if (replayError && danglingError) {
            throw new AggregateError([replayError, danglingError], 'Replay and dangling-cleanup both failed');
        }
        if (replayError)
            throw replayError;
        if (danglingError)
            throw danglingError;
        return state;
    }
    getPendingToolCalls() {
        return this.machine
            .snapshot()
            .pendingToolCalls.map(toLegacyPendingToolCall);
    }
    getReplayState() {
        return this.machine.snapshot();
    }
    createMachine(options = {}) {
        const cumulative = this.ctx.cumulativeUsage;
        const initialState = {
            v: 1,
            pendingToolCalls: (options.pendingToolCalls ?? []).map(toPendingTranscriptToolCall),
            cumulativeUsage: cumulative
                ? { ...cumulative }
                : {
                    promptTokens: 0,
                    cachedTokens: 0,
                    candidateTokens: 0,
                    apiTimeMs: 0,
                },
            ...(options.goalState ? { goalState: options.goalState } : {}),
            ...(options.goalCause ? { goalCause: options.goalCause } : {}),
        };
        return createTranscriptReplayMachine({
            initialState,
            gaps: options.gaps,
            presentation: this.presentationAdapter(),
            onDiagnostic: (diagnostic) => {
                if (diagnostic.code === 'malformed_part' &&
                    diagnostic.path ===
                        'systemPayload.outputHistoryItems.goalStatus.condition') {
                    writeStderrLineSafe(`LailatulCoder: ${diagnostic.message}`);
                }
            },
        });
    }
    presentationAdapter() {
        return {
            resolveToolMetadata: (toolName, args) => this.toolCallEmitter.resolveToolMetadata(toolName, { ...args }),
            formatHistoryGap: (gap) => formatHistoryGapNotice(gap),
            buildToolResultContentPrefix,
        };
    }
    async sendUpdate(update) {
        if (this.ctx.messageRewriter) {
            await this.ctx.messageRewriter.interceptUpdate(update);
            return;
        }
        await this.ctx.sendUpdate(update);
    }
    copyCumulativeUsage(state) {
        const cumulative = this.ctx.cumulativeUsage;
        if (!cumulative)
            return;
        cumulative.promptTokens = state.cumulativeUsage.promptTokens;
        cumulative.cachedTokens = state.cumulativeUsage.cachedTokens;
        cumulative.candidateTokens = state.cumulativeUsage.candidateTokens;
        cumulative.apiTimeMs = state.cumulativeUsage.apiTimeMs;
    }
    setActiveRecordId(recordId, timestamp) {
        this.ctx.setActiveRecordId?.(recordId, timestamp);
    }
}
function toPendingTranscriptToolCall(pending) {
    return {
        callId: pending.callId,
        toolName: pending.toolName,
        sourceRecordId: pending.recordId,
        ...(pending.timestamp ? { sourceTimestamp: pending.timestamp } : {}),
    };
}
function toLegacyPendingToolCall(pending) {
    return {
        callId: pending.callId,
        toolName: pending.toolName,
        recordId: pending.sourceRecordId,
        ...(pending.sourceTimestamp ? { timestamp: pending.sourceTimestamp } : {}),
    };
}
//# sourceMappingURL=history-replayer.js.map