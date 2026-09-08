/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type SupportedLanguage, SUPPORTED_LANGUAGES, getLanguageNameFromLocale } from './languages.js';
export { MUST_TRANSLATE_KEYS } from './mustTranslateKeys.js';
export type { SupportedLanguage };
export { SUPPORTED_LANGUAGES, getLanguageNameFromLocale };
/**
 * Get the path to the user's custom locales directory.
 * Users can place custom language packs (e.g., es.js, fr.js) in this directory.
 * @returns The path to ~/.qwen/locales
 */
export declare function getUserLocalesDirectory(): string;
export declare function detectSystemLanguage(): SupportedLanguage;
export declare function setLanguage(lang: SupportedLanguage | 'auto'): void;
export declare function setLanguageAsync(lang: SupportedLanguage | 'auto'): Promise<void>;
export declare function getCurrentLanguage(): SupportedLanguage;
export declare function t(key: string, params?: Record<string, string>): string;
/**
 * Locale-aware tool display name for chat-stream badges. Looks up the
 * `toolDisplayName.<English display name>` key so tool labels never collide
 * with same-spelled generic UI strings (e.g. a standalone "Shell" label that
 * intentionally stays English). Falls back to the English display name when the
 * active locale has no entry, so English and untranslated tools are unaffected.
 */
export declare function localizeToolDisplayName(displayName: string): string;
/**
 * Get a translation that is an array of strings.
 * @param key The translation key
 * @returns The array of strings, or an empty array if not found or not an array
 */
export declare function ta(key: string): string[];
export declare function initializeI18n(lang?: SupportedLanguage | 'auto'): Promise<void>;
/**
 * Resolves the language setting from env / settings / auto-detect.
 * Shared by initializer.ts and extension commands that run before full init.
 */
export declare function resolveLanguageSetting(settingsLanguage?: string): SupportedLanguage | 'auto';
