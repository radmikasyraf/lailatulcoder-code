/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
// ─── Singleton State ─────────────────────────────────────────
let leaderCallbacks = null;
// ─── Public API ──────────────────────────────────────────────
/**
 * Register the leader's approval callbacks.
 * Called once when the team is created.
 */
export function registerLeader(callbacks) {
    leaderCallbacks = callbacks;
}
/**
 * Get the currently registered leader callbacks, or null
 * if no leader is registered (startup race / not in a team).
 */
export function getLeader() {
    return leaderCallbacks;
}
/**
 * Unregister the leader. Called on team delete / cleanup.
 */
export function unregisterLeader() {
    leaderCallbacks = null;
}
/**
 * Forward a teammate's tool approval request to the leader.
 *
 * If the bridge is registered, the request is pushed to the
 * leader's approval queue. Returns true if forwarded.
 *
 * If no leader is registered (bridge is null), returns false.
 * The caller should fall back to a host-side permission channel
 * (e.g. emit a `TEAMMATE_APPROVAL_REQUEST` team event).
 */
export function forwardApproval(teammateName, teammateColor, details) {
    if (!leaderCallbacks) {
        return false;
    }
    leaderCallbacks.enqueueApproval({
        teammateName,
        teammateColor,
        details,
    });
    return true;
}
/**
 * Create a wrapper around a teammate-tool confirmation that adds
 * the teammate's name as a UI badge. The wrapper's `onConfirm`
 * delegates to the supplied `respond` callback (from the
 * `AgentApprovalRequestEvent`) — using `original.onConfirm`
 * directly would throw because the agent-event boundary strips
 * that callback off.
 */
export function wrapConfirmWithBadge(original, teammateName, respond, _teammateColor) {
    return {
        ...original,
        title: `[${teammateName}] ${original.title}`,
        onConfirm: async (outcome, payload) => {
            await respond(outcome, payload);
        },
    };
}
//# sourceMappingURL=leaderPermissionBridge.js.map