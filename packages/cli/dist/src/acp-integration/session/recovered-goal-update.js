/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoalPersistenceUnavailableError, } from '@lailatul-coder/lailatul-coder-core';
import { collectGoalStatusItemsFromRecords, findGoalToRestore, } from '../../ui/utils/restoreGoal.js';
import { buildGoalStateUpdate, buildGoalStatusUpdate, } from './emitters/MessageEmitter.js';
export async function renderPreparedGoalUpdate(getRuntime, options = {}) {
    let runtime;
    try {
        runtime = await getRuntime();
    }
    catch (error) {
        if (!(error instanceof GoalPersistenceUnavailableError))
            throw error;
        const status = unrestorableGoalStatus(options.replayedRecords, options.bootstrap);
        return { updates: status ? [buildGoalStatusUpdate(status)] : [] };
    }
    const cause = runtime.getRecoveryCause?.();
    if (!cause)
        return { updates: [] };
    const snapshot = runtime.getSnapshot();
    const publicationKey = goalPublicationKey(snapshot, cause);
    if (options.hideRuntimeGoal) {
        return {
            publicationKey,
            ...(snapshot.goal
                ? {
                    suppressedGoalId: snapshot.goal.goalId,
                }
                : {}),
            updates: [],
        };
    }
    const bootstrapGoal = options.bootstrap?.goalState?.goal;
    const bootstrapMatchesRuntime = bootstrapGoal != null &&
        snapshot.goal?.goalId === bootstrapGoal.goalId &&
        snapshot.goal?.revision === bootstrapGoal.revision;
    return {
        publicationKey,
        updates: options.bootstrap && bootstrapMatchesRuntime
            ? []
            : [buildGoalStateUpdate(snapshot, cause, options.previousGoal ?? null)],
    };
}
function unrestorableGoalStatus(replayedRecords, bootstrap) {
    const active = (replayedRecords?.length
        ? findGoalToRestore(collectGoalStatusItemsFromRecords(replayedRecords))
        : undefined) ?? bootstrap?.goalStatus;
    if (!active)
        return undefined;
    return {
        kind: 'cleared',
        condition: active.condition,
        iterations: active.iterations,
        ...(active.setAt !== undefined ? { setAt: active.setAt } : {}),
        lastReason: 'Goal not restored: its saved state could not be read, so this session is not driving it.',
    };
}
export function goalPublicationKey(snapshot, cause) {
    return cause ? `${cause}:${JSON.stringify(snapshot)}` : undefined;
}
//# sourceMappingURL=recovered-goal-update.js.map