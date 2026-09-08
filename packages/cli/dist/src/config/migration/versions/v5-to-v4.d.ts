/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SettingsMigration } from '../types.js';
/**
 * V5 -> V4 migration (ProviderConfig object → modelProviders array).
 *
 * This is the inverse of the V4 -> V5 migration that shipped with #5089 and
 * was subsequently reverted. V5 wrapped each `modelProviders` array in a
 * `{ protocol, models }` object; the reverted (V4) code consumes the arrays
 * directly, so a settings file left at `$version: 5` would throw on load
 * ("models is not iterable").
 *
 * This migration unwraps each `{ protocol, models }` back to its `models`
 * array and resets `$version` to 4. The `protocol` field is dropped because
 * V4 re-derives the protocol from the provider key.
 */
export declare class V5ToV4Migration implements SettingsMigration {
    readonly fromVersion = 5;
    readonly toVersion = 4;
    shouldMigrate(settings: unknown): boolean;
    migrate(settings: unknown, _scope: string): {
        settings: unknown;
        warnings: string[];
    };
}
export declare const v5ToV4Migration: V5ToV4Migration;
