/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Settings, SettingScope, LoadedSettings } from '../config/settings.js';
import type { SettingDefinition, SettingsValue } from '../config/settingsSchema.js';
type FlattenedSchema = Record<string, SettingDefinition & {
    key: string;
}>;
/** Returns a flattened schema, the first call is memoized for future requests. */
export declare function getFlattenedSchema(): FlattenedSchema;
declare function clearFlattenedSchema(): void;
/**
 * Get a setting definition by key
 */
export declare function getSettingDefinition(key: string): (SettingDefinition & {
    key: string;
}) | undefined;
/**
 * Check if a setting requires restart
 */
export declare function requiresRestart(key: string): boolean;
/**
 * Get the default value for a setting
 */
export declare function getDefaultValue(key: string): SettingsValue;
/**
 * Get all setting keys that require restart
 */
export declare function getRestartRequiredSettings(): string[];
/**
 * Recursively gets a value from a nested object using a key path array.
 */
export declare function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown;
export declare function getNestedProperty(obj: Record<string, unknown>, path: string): unknown;
/**
 * Get the effective value for a setting, considering inheritance from higher scopes
 * Always returns a value (never undefined) - falls back to default if not set anywhere
 */
export declare function getEffectiveValue(key: string, settings: Settings, mergedSettings: Settings): SettingsValue;
/**
 * Get all setting keys from the schema
 */
export declare function getAllSettingKeys(): string[];
export declare const MAX_SETTING_STRING_VALUE_LENGTH = 1024;
export declare function validateSettingValue(def: SettingDefinition, value: unknown): string | undefined;
/**
 * Get all setting keys that should be shown in the dialog, sorted by display order
 */
export declare function getDialogSettingKeys(): string[];
/**
 * Check if a setting exists in the original settings file for a scope
 */
export declare function settingExistsInScope(key: string, scopeSettings: Settings): boolean;
export declare function setNestedPropertyForce(obj: Record<string, unknown>, path: string, value: unknown): void;
export declare function setNestedPropertySafe(obj: Record<string, unknown>, path: string, value: unknown): void;
export declare function deleteNestedPropertySafe(obj: Record<string, unknown>, path: string): void;
/**
 * Set a setting value in the pending settings
 */
export declare function setPendingSettingValue(key: string, value: boolean, pendingSettings: Settings): Settings;
/**
 * Generic setter: Set a setting value (boolean, number, string, etc.) in the pending settings
 */
export declare function setPendingSettingValueAny(key: string, value: SettingsValue, pendingSettings: Settings): Settings;
/**
 * Get the restart required settings from a set of modified settings
 */
export declare function getRestartRequiredFromModified(modifiedSettings: Set<string>): string[];
/**
 * Save modified settings to the appropriate scope
 */
export declare function saveModifiedSettings(modifiedSettings: Set<string>, pendingSettings: Settings, loadedSettings: LoadedSettings, scope: SettingScope): void;
/**
 * Get the display value for a setting, showing current scope value with default change indicator
 */
export declare function getDisplayValue(key: string, settings: Settings, _mergedSettings: Settings, modifiedSettings: Set<string>, pendingSettings?: Settings): string;
/**
 * Check if a setting doesn't exist in current scope (should be greyed out)
 */
export declare function isDefaultValue(key: string, settings: Settings): boolean;
/**
 * Backup a settings file before modification.
 * Always creates a fresh backup with `.orig` suffix (overwrites any stale backup).
 * @param filePath - Path to the settings file to backup
 * @returns boolean indicating whether a backup was created
 */
export declare function backupSettingsFile(filePath: string): boolean;
/**
 * Restore a settings file from its `.orig` backup created by {@link backupSettingsFile}.
 * Removes the backup file after a successful restore.
 * @param filePath - Path to the settings file to restore
 * @returns boolean indicating whether the restore succeeded
 */
export declare function restoreSettingsFromBackup(filePath: string): boolean;
/**
 * Remove the `.orig` backup after a successful operation.
 * @param filePath - Path to the settings file whose backup should be removed
 */
export declare function cleanupSettingsBackup(filePath: string): void;
export declare const TEST_ONLY: {
    clearFlattenedSchema: typeof clearFlattenedSchema;
};
export {};
