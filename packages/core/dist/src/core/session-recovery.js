/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import { buildApiHistoryFromConversation, } from '../services/sessionService.js';
import { detectTurnInterruption, buildSyntheticToolResponseParts, } from './turn-interruption.js';
import { ORPHAN_TOOL_USE_REPAIR_REASON, repairOrphanedToolUseTurns, } from './geminiChat.js';
function createPlanId(sessionId, historyLength) {
    return `${sessionId}:${historyLength}`;
}
function buildVisibleNotice(kind, repairs, historyGaps) {
    if (kind === 'clean') {
        return undefined;
    }
    if (kind === 'degraded_history') {
        return (`Resumed session history is incomplete: detected ` +
            `${historyGaps.length} missing parent link(s). Automatic continuation ` +
            `is disabled for this recovery.`);
    }
    if (kind === 'interrupted_prompt') {
        return 'Previous session appears to have stopped after user input before the model completed a response.';
    }
    const synthesized = repairs.filter((repair) => repair.type === 'synthesized_tool_result').length;
    if (synthesized > 0) {
        return (`Previous session appears to have stopped during tool execution. ` +
            `Synthesized ${synthesized} failed tool result(s) so the history can continue safely.`);
    }
    return 'Previous session appears to have stopped during tool execution.';
}
export function buildSessionRecoveryPlan({ sessionId, conversation, historyGaps, options, }) {
    return buildSessionRecoveryPlanFromApiHistory({
        sessionId,
        apiHistory: buildApiHistoryFromConversation(conversation),
        historyGaps,
        options,
    });
}
export function buildSessionRecoveryPlanFromApiHistory({ sessionId, apiHistory: inputApiHistory, historyGaps, options, }) {
    const originalApiHistory = structuredClone(inputApiHistory);
    const gaps = historyGaps ?? [];
    const planId = createPlanId(sessionId, originalApiHistory.length);
    const apiHistory = structuredClone(originalApiHistory);
    const repairResult = repairOrphanedToolUseTurns(apiHistory);
    const repairs = [
        ...repairResult.injected.map((repair) => ({
            type: 'synthesized_tool_result',
            callId: repair.callId,
            name: repair.name,
        })),
        ...repairResult.droppedDuplicates.map((repair) => ({
            type: 'dropped_duplicate_tool_result',
            callId: repair.callId,
            name: repair.name,
        })),
        ...gaps.map((gap) => ({
            type: 'history_gap',
            childUuid: gap.childUuid,
            missingParentUuid: gap.missingParentUuid,
        })),
    ];
    if (gaps.length > 0) {
        return {
            planId,
            sessionId,
            kind: 'degraded_history',
            originalApiHistory,
            apiHistory,
            repairs,
            canContinue: false,
            canAutoContinue: false,
            requiresUserConfirmation: true,
            visibleNotice: buildVisibleNotice('degraded_history', repairs, gaps),
        };
    }
    const interruption = detectTurnInterruption(originalApiHistory);
    if (interruption.kind === 'none') {
        return {
            planId,
            sessionId,
            kind: 'clean',
            originalApiHistory,
            apiHistory,
            repairs,
            canContinue: false,
            canAutoContinue: false,
            requiresUserConfirmation: false,
        };
    }
    if (interruption.kind === 'interrupted_prompt') {
        const continuation = {
            mode: 'retry_user_parts',
            parts: interruption.parts,
            displayText: 'Continue interrupted user prompt',
        };
        return {
            planId,
            sessionId,
            kind: 'interrupted_prompt',
            originalApiHistory,
            apiHistory,
            repairs,
            canContinue: true,
            canAutoContinue: options?.allowAutoContinue === true,
            requiresUserConfirmation: options?.allowAutoContinue !== true,
            visibleNotice: buildVisibleNotice('interrupted_prompt', repairs, gaps),
            continuation,
        };
    }
    const continuation = {
        mode: 'tool_result_parts',
        parts: buildSyntheticToolResponseParts(interruption.danglingCalls, ORPHAN_TOOL_USE_REPAIR_REASON),
        displayText: 'Continue interrupted tool turn',
    };
    return {
        planId,
        sessionId,
        kind: 'interrupted_turn',
        originalApiHistory,
        apiHistory,
        repairs,
        canContinue: true,
        canAutoContinue: false,
        requiresUserConfirmation: true,
        visibleNotice: buildVisibleNotice('interrupted_turn', repairs, gaps),
        continuation,
    };
}
//# sourceMappingURL=session-recovery.js.map