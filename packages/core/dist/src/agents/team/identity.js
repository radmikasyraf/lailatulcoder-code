/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview AsyncLocalStorage-based teammate identity.
 *
 * Provides per-async-context identity for in-process teammates so that
 * tools (SendMessage, TaskUpdate, etc.) can determine which agent is
 * calling them without passing identity through every function signature.
 *
 * Resolution order: AsyncLocalStorage context (in-process) → undefined.
 * Phase 2 will add dynamic team context for pane-based teammates.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
/**
 * Per-async-context store for teammate identity.
 * Set by TeamManager when running an in-process teammate's code.
 */
export const teammateIdentityStore = new AsyncLocalStorage();
/**
 * Get the current teammate identity, or undefined if not in a
 * teammate context.
 */
export function getTeammateContext() {
    return teammateIdentityStore.getStore();
}
/**
 * Whether the current context is an in-process teammate.
 */
export function isInProcessTeammate() {
    return teammateIdentityStore.getStore() !== undefined;
}
/**
 * Get the current agent name, or undefined.
 */
export function getAgentName() {
    return teammateIdentityStore.getStore()?.agentName;
}
/**
 * Get the current team name, or undefined.
 */
export function getTeamName() {
    return teammateIdentityStore.getStore()?.teamName;
}
/**
 * Resolve the active team name: teammate identity first (when running
 * inside a teammate's async context), then fall back to the leader's
 * team context.
 */
export function resolveActiveTeamName(fallback) {
    return getTeamName() ?? fallback;
}
/**
 * Whether the current context is any teammate (leader or worker).
 * Alias for `isInProcessTeammate()`.
 */
export const isTeammate = isInProcessTeammate;
/**
 * Whether the current context is the team leader.
 */
export function isTeamLead() {
    return teammateIdentityStore.getStore()?.isTeamLead ?? false;
}
/**
 * Get the current teammate's assigned color, or undefined.
 */
export function getTeammateColor() {
    return teammateIdentityStore.getStore()?.color;
}
/**
 * Run a function within a teammate identity context.
 * Used by TeamManager when executing in-process teammate code.
 */
export function runWithTeammateIdentity(identity, fn) {
    return teammateIdentityStore.run(identity, fn);
}
//# sourceMappingURL=identity.js.map