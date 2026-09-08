/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Resolves a LocalizableString to a plain string for the given locale.
 *
 * Fallback chain:
 *   exact match (e.g., 'zh-TW') → base language (e.g., 'zh') → 'en' → first value
 */
export function resolveLocalizableString(value, locale) {
    if (value === undefined)
        return undefined;
    if (typeof value === 'string')
        return value;
    const baseLang = locale.split('-')[0];
    const prioritized = [
        value[locale],
        baseLang !== locale ? value[baseLang] : undefined,
        value['en'],
    ];
    for (const v of prioritized) {
        if (typeof v === 'string' && v)
            return v;
    }
    return Object.values(value).find((v) => typeof v === 'string' && v.length > 0);
}
/**
 * Resolves all localizable fields in a raw extension config to plain strings.
 */
export function resolveExtensionConfigLocale(rawConfig, locale) {
    const { displayName, description, settings: rawSettings, ...rest } = rawConfig;
    const hasLocalizableFields = (typeof displayName === 'object' && displayName !== null) ||
        (typeof description === 'object' && description !== null);
    const resolved = {
        ...rest,
        displayName: resolveLocalizableString(displayName, locale),
        description: resolveLocalizableString(description, locale),
        ...(hasLocalizableFields
            ? { _rawLocalizable: { displayName, description } }
            : {}),
    };
    if (rawSettings) {
        resolved.settings = rawSettings.map((setting) => ({
            ...setting,
            description: resolveLocalizableString(setting.description, locale) ?? '',
        }));
    }
    return resolved;
}
/**
 * Resolves extension displayName for the given locale at display time.
 * Falls back to the pre-resolved value, then to extension name.
 */
export function getExtensionDisplayName(ext, locale) {
    const raw = ext.config?._rawLocalizable?.displayName;
    if (raw)
        return resolveLocalizableString(raw, locale) ?? ext.name;
    return ext.displayName ?? ext.name;
}
/**
 * Resolves extension description for the given locale at display time.
 */
export function getExtensionDescription(ext, locale) {
    const raw = ext.config?._rawLocalizable?.description;
    if (raw)
        return resolveLocalizableString(raw, locale);
    const desc = ext.config?.description;
    return typeof desc === 'string' ? desc : undefined;
}
//# sourceMappingURL=i18n.js.map