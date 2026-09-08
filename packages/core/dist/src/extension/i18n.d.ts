/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ExtensionConfig } from './extensionManager.js';
import type { ExtensionSetting } from './extensionSettings.js';
/**
 * A string field that can be either a plain string or a locale map.
 * Keys in the record are locale codes (e.g., 'en', 'zh', 'zh-TW', 'ja').
 */
export type LocalizableString = string | Record<string, string>;
/**
 * Raw shape of qwen-extension.json before locale resolution.
 * `description`, `displayName`, and setting descriptions may be locale maps.
 */
export interface RawExtensionConfig extends Omit<ExtensionConfig, 'description' | 'displayName' | 'settings'> {
    description?: LocalizableString;
    displayName?: LocalizableString;
    settings?: RawExtensionSetting[];
}
export interface RawExtensionSetting extends Omit<ExtensionSetting, 'description'> {
    description: LocalizableString;
}
/**
 * Resolves a LocalizableString to a plain string for the given locale.
 *
 * Fallback chain:
 *   exact match (e.g., 'zh-TW') → base language (e.g., 'zh') → 'en' → first value
 */
export declare function resolveLocalizableString(value: LocalizableString | undefined, locale: string): string | undefined;
/**
 * Resolves all localizable fields in a raw extension config to plain strings.
 */
export declare function resolveExtensionConfigLocale(rawConfig: RawExtensionConfig, locale: string): ExtensionConfig;
/**
 * Resolves extension displayName for the given locale at display time.
 * Falls back to the pre-resolved value, then to extension name.
 */
export declare function getExtensionDisplayName(ext: {
    name: string;
    displayName?: string;
    config?: ExtensionConfig;
}, locale: string): string;
/**
 * Resolves extension description for the given locale at display time.
 */
export declare function getExtensionDescription(ext: {
    config?: ExtensionConfig;
    description?: string;
}, locale: string): string | undefined;
