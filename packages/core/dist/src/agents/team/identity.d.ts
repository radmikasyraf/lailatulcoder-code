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
import type { TeammateIdentity } from './types.js';
/**
 * Per-async-context store for teammate identity.
 * Set by TeamManager when running an in-process teammate's code.
 */
export declare const teammateIdentityStore: AsyncLocalStorage<TeammateIdentity>;
/**
 * Get the current teammate identity, or undefined if not in a
 * teammate context.
 */
export declare function getTeammateContext(): TeammateIdentity | undefined;
/**
 * Whether the current context is an in-process teammate.
 */
export declare function isInProcessTeammate(): boolean;
/**
 * Get the current agent name, or undefined.
 */
export declare function getAgentName(): string | undefined;
/**
 * Get the current team name, or undefined.
 */
export declare function getTeamName(): string | undefined;
/**
 * Resolve the active team name: teammate identity first (when running
 * inside a teammate's async context), then fall back to the leader's
 * team context.
 */
export declare function resolveActiveTeamName(fallback: string | undefined): string | undefined;
/**
 * Whether the current context is any teammate (leader or worker).
 * Alias for `isInProcessTeammate()`.
 */
export declare const isTeammate: typeof isInProcessTeammate;
/**
 * Whether the current context is the team leader.
 */
export declare function isTeamLead(): boolean;
/**
 * Get the current teammate's assigned color, or undefined.
 */
export declare function getTeammateColor(): string | undefined;
/**
 * Run a function within a teammate identity context.
 * Used by TeamManager when executing in-process teammate code.
 */
export declare function runWithTeammateIdentity<T>(identity: TeammateIdentity, fn: () => T): T;
