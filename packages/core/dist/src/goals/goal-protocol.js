/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export const GOAL_STATE_VERSION = 2;
export const GOAL_PROPOSAL_REASON_MAX_CHARACTERS = 8_000;
export const GOAL_PROPOSAL_REASON_MAX_BYTES = 16_000;
export const GOAL_CHECKPOINT_CLAIM_LIMIT = 32;
export const GOAL_CHECKPOINT_CLAIM_MAX_CHARACTERS = 2_000;
export const GOAL_CHECKPOINT_CLAIM_MAX_BYTES = 16_000;
export const GOAL_CHECKPOINT_SOURCE_REFERENCE_LIMIT = 32;
export const GOAL_EVIDENCE_CATALOG_EXHAUSTED_REASON = 'The current Goal revision exceeded the bounded evidence catalog. Automatic retries cannot recover. Edit or replace the Goal before resuming it.';
export const GOAL_CHECKPOINT_REQUEST_TOO_LARGE_REASON = 'The current Goal revision exceeded the checkpoint verifier request limit. Automatic retries cannot recover. Edit or replace the Goal before resuming it.';
export function isGoalLimitKind(value) {
    return value === 'evidence_catalog' || value === 'checkpoint_request';
}
/** The limit a `usage_limited` reason denotes, for reasons that denote one. */
export function goalLimitKindForReason(reason) {
    if (reason === GOAL_EVIDENCE_CATALOG_EXHAUSTED_REASON) {
        return 'evidence_catalog';
    }
    if (reason === GOAL_CHECKPOINT_REQUEST_TOO_LARGE_REASON) {
        return 'checkpoint_request';
    }
    return undefined;
}
export const PAUSED_GOAL_SYSTEM_REMINDER = '<system-reminder>\nThe Goal is paused. Do not continue its objective unless the user resumes it. Treat this message as ordinary conversation.\n</system-reminder>';
export function isGoalEvidenceProofKind(value) {
    return (value === 'user_input' ||
        value === 'delivered_output' ||
        value === 'external_fact');
}
/**
 * What a session with no reachable Goal runtime looks like.
 *
 * `getGoalRuntimeReady()` rejects when goal persistence is unavailable —
 * permanently, once a malformed transcript record has set a sticky recovery
 * error. For anything that only reads or reduces goal state, the honest
 * answer is "no goal", not a failed request: the caller asked what the goal
 * is, and the answer is nothing.
 */
export function emptyGoalSnapshot() {
    return { v: GOAL_STATE_VERSION, goal: null, activity: 'idle' };
}
/** True while any new model send must carry the runtime's exact turn permit. */
export function goalRequiresExactPermit(snapshot) {
    return (snapshot.goal !== null &&
        (snapshot.goal.status === 'active' || snapshot.activity === 'running'));
}
export function isRepeatedBlockerProposal(proposal) {
    return (proposal.status === 'blocked' &&
        proposal.blockerKind !== 'authority' &&
        proposal.blockerKind !== 'external');
}
export function validateGoalProposalReason(reason) {
    if (!reason.trim())
        return 'Goal proposal reason must not be empty';
    if ([...reason].length > GOAL_PROPOSAL_REASON_MAX_CHARACTERS) {
        return `Goal proposal reason exceeds ${GOAL_PROPOSAL_REASON_MAX_CHARACTERS} characters`;
    }
    if (new TextEncoder().encode(reason).byteLength > GOAL_PROPOSAL_REASON_MAX_BYTES) {
        return `Goal proposal reason exceeds ${GOAL_PROPOSAL_REASON_MAX_BYTES} UTF-8 bytes`;
    }
    return null;
}
//# sourceMappingURL=goal-protocol.js.map