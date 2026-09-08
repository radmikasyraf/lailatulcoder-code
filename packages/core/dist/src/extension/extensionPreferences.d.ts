/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Install/visibility scope intent recorded for an extension. The Installed
 * view uses it to group extensions the way the user installed them:
 * - `user`    -> Global (User Scope), available everywhere.
 * - `project` -> Project (Workspace), enabled for the current workspace only.
 *
 * Enable/disable state itself still lives in `extension-enablement.json`; this
 * value only records *where the user chose to install* an extension so the UI
 * can render the right grouping.
 */
export type ExtensionScope = 'user' | 'project';
export interface ExtensionPreferences {
    /** Names of extensions/MCP servers the user has favorited. */
    favorites: string[];
    /** Per-extension scope intent, keyed by extension name. */
    scopes: Record<string, ExtensionScope>;
    /**
     * MCP servers the user disabled individually inside an extension, keyed by
     * extension name. Namespaced per extension (instead of the global
     * `mcp.excluded` list) so a disable can never affect a same-named server
     * from another source, and uninstalling the extension cleans it up.
     */
    disabledMcpServers: Record<string, string[]>;
}
/**
 * Persists user preferences for extensions (favorites, scope intent) that are
 * orthogonal to the enable/disable enablement config. Backed by a single JSON
 * file so it is cheap to read/write and easy to reason about.
 */
export declare class ExtensionPreferencesStore {
    private readonly filePath;
    private cache;
    constructor(filePath: string);
    read(): ExtensionPreferences;
    private write;
    isFavorite(name: string): boolean;
    getFavorites(): string[];
    /**
     * Toggles the favorite state for an item and returns the new state.
     */
    toggleFavorite(name: string): boolean;
    getScope(name: string): ExtensionScope | undefined;
    getScopes(): Record<string, ExtensionScope>;
    setScope(name: string, scope: ExtensionScope): void;
    /** MCP servers individually disabled inside the given extension. */
    getDisabledMcpServers(extensionName: string): string[];
    setMcpServerDisabled(extensionName: string, serverName: string, disabled: boolean): void;
    /** Removes all preference state for an extension (used on uninstall). */
    clear(name: string): void;
}
