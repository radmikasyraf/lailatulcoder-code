/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type { SettingsMigration, MigrationResult } from './types.js';
export { MigrationScheduler } from './scheduler.js';
export { v1ToV2Migration, V1ToV2Migration } from './versions/v1-to-v2.js';
export { v2ToV3Migration, V2ToV3Migration } from './versions/v2-to-v3.js';
export { v3ToV4Migration, V3ToV4Migration } from './versions/v3-to-v4.js';
export { v5ToV4Migration, V5ToV4Migration } from './versions/v5-to-v4.js';
import type { MigrationResult } from './types.js';
/**
 * Ordered array of all settings migrations.
 * Use this with MigrationScheduler to run the full migration chain.
 *
 * @example
 * ```typescript
 * const scheduler = new MigrationScheduler(ALL_MIGRATIONS);
 * const result = scheduler.migrate(settings);
 * ```
 */
export declare const ALL_MIGRATIONS: readonly [import("./versions/v1-to-v2.js").V1ToV2Migration, import("./versions/v2-to-v3.js").V2ToV3Migration, import("./versions/v3-to-v4.js").V3ToV4Migration];
/**
 * Downgrade migrations: transforms that bring settings written by a *newer*
 * app version back down to SETTINGS_VERSION. These are intentionally NOT part
 * of the ascending forward chain in {@link ALL_MIGRATIONS}.
 *
 * `v5 -> v4` was added when reverting #5089 (the Protocol/ProviderConfig
 * refactor). Settings already migrated to `$version: 5` carry a modelProviders
 * shape the reverted code cannot read, so they must be converged back to v4.
 */
export declare const DOWNGRADE_MIGRATIONS: readonly [import("./versions/v5-to-v4.js").V5ToV4Migration];
/**
 * Convenience function that runs all migrations on the given settings.
 * This is the primary entry point for settings migration.
 *
 * @param settings - The settings object to migrate
 * @param scope - The scope of settings being migrated
 * @returns MigrationResult containing the final settings, version, and execution log
 *
 * @example
 * ```typescript
 * const result = runMigrations(settings, 'User');
 * if (result.executedMigrations.length > 0) {
 *   console.log(`Migrated from version ${result.executedMigrations[0].fromVersion} to ${result.finalVersion}`);
 * }
 * ```
 */
export declare function runMigrations(settings: unknown, scope: string): MigrationResult;
/**
 * Checks if the given settings need migration.
 * Returns true only if at least one registered migration would be applied.
 *
 * This function checks:
 * 1. If $version field exists and is a number:
 *    - Returns false only when $version === SETTINGS_VERSION (already current)
 *    - Otherwise (a lower OR higher version) returns true only when at least
 *      one migration can execute for the current settings shape. A version
 *      above SETTINGS_VERSION deliberately falls through here rather than being
 *      short-circuited, so downgrade migrations (e.g. v5 -> v4) can still apply.
 * 2. If $version field is missing or invalid:
 *    - Uses fallback logic by checking individual migrations
 *
 * Note:
 * - Legacy numeric versions that have no executable migrations are handled by
 *   the settings loader via version normalization (bump metadata to current).
 *
 * @param settings - The settings object to check
 * @returns true if migration is needed, false otherwise
 */
export declare function needsMigration(settings: unknown): boolean;
