/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
import type { AgentViewActions } from '../contexts/AgentViewContext.js';
/**
 * Bridge team in-process events to agent tab registration/unregistration.
 *
 * Called by AgentViewProvider — accepts config and actions directly so the
 * hook has no dependency on AgentViewContext (avoiding a circular import).
 */
export declare function useTeamInProcess(config: Config | null, actions: AgentViewActions): void;
