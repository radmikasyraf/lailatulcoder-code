/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HookConfigDisplayInfo, HookEventDisplayInfo } from './types.js';
export declare function normalizeMatcher(matcher?: string): string;
export declare function addConfigToMatcherGroup(hookInfo: HookEventDisplayInfo, matcher: string | undefined, sequential: boolean | undefined, configInfo: HookConfigDisplayInfo, groupByMatcher?: boolean): void;
export declare function getAllConfigs(hookInfo: HookEventDisplayInfo): HookConfigDisplayInfo[];
