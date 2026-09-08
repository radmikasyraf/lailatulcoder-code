/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LoadedSettings } from './settings.js';
export declare const PERMISSION_RULE_TYPES: readonly ["allow", "ask", "deny"];
export declare const MAX_PERMISSION_RULES_COUNT = 500;
export declare const MAX_PERMISSION_RULE_LENGTH = 512;
export type PermissionRuleType = (typeof PERMISSION_RULE_TYPES)[number];
export type PermissionSettingsScope = 'user' | 'workspace';
export interface PermissionRuleSet {
    allow: string[];
    ask: string[];
    deny: string[];
}
export interface PermissionSettingsScopeState {
    path: string;
    rules: PermissionRuleSet;
}
export interface QwenPermissionSettings {
    v: 1;
    user: PermissionSettingsScopeState;
    workspace: PermissionSettingsScopeState;
    merged: PermissionRuleSet;
    isTrusted: boolean;
}
export declare class PermissionRulesValidationError extends Error {
    readonly code: 'invalid_rules';
    constructor(message: string, code: 'invalid_rules');
}
export declare function isPermissionRuleType(value: unknown): value is PermissionRuleType;
export declare function readPermissionRuleSet(settings: unknown): PermissionRuleSet;
export declare function normalizePermissionRules(value: unknown, opts?: {
    existingRules?: readonly string[];
}): string[];
export declare function normalizePermissionRuleInputs(value: unknown): string[];
export declare function buildPermissionSettings(settings: LoadedSettings): QwenPermissionSettings;
