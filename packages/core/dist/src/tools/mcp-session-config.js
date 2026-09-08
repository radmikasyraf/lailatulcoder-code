/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export function normalizeMcpIncludeEntry(entry) {
    const paren = entry.indexOf('(');
    return paren === -1 ? entry : entry.slice(0, paren);
}
/**
 * Filter lists arrive straight from settings files without schema
 * coercion, so shapes like `excludeTools: "x"` or `includeTools: [123]`
 * are possible. Coerce to the nearest valid form so the metadata key and
 * the runtime filter stay total and agree with each other instead of
 * throwing.
 */
export function coerceMcpFilterEntries(entries) {
    return (Array.isArray(entries) ? entries : []).filter((entry) => typeof entry === 'string');
}
function normalizeFilter(entries, stripParenthesizedSuffix) {
    const normalized = coerceMcpFilterEntries(entries).map((entry) => stripParenthesizedSuffix ? normalizeMcpIncludeEntry(entry) : entry);
    return [...new Set(normalized)].sort();
}
/**
 * Stable identity for MCP settings projected into one session rather than
 * used to create the transport. Semantically equivalent filters share a key:
 * order, duplicates, and include-list argument suffixes do not cause
 * registration churn. An absent include list remains distinct from an empty
 * one because they mean "allow all" and "allow none", respectively.
 */
export function mcpSessionMetadataKey(config) {
    return JSON.stringify({
        trust: config.trust ?? null,
        alwaysLoadTools: config.alwaysLoadTools === true,
        // An absent allowlist accepts every name, while an explicit empty
        // allowlist accepts none. JSON `null` is treated as absent because
        // every runtime filter treats a falsy include list as "allow all".
        includeTools: config.includeTools == null
            ? null
            : normalizeFilter(config.includeTools, true),
        excludeTools: normalizeFilter(config.excludeTools, false),
    });
}
//# sourceMappingURL=mcp-session-config.js.map