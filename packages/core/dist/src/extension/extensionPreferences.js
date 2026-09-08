/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { atomicWriteFileSync } from '../utils/atomicFileWrite.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { quarantineCorruptFile } from './corruptFile.js';
const debugLogger = createDebugLogger('EXT_PREFERENCES');
function isExtensionScope(value) {
    return value === 'user' || value === 'project';
}
/** Always returns fresh containers so callers can safely mutate the result. */
function emptyPreferences() {
    return { favorites: [], scopes: {}, disabledMcpServers: {} };
}
/**
 * Persists user preferences for extensions (favorites, scope intent) that are
 * orthogonal to the enable/disable enablement config. Backed by a single JSON
 * file so it is cheap to read/write and easy to reason about.
 */
export class ExtensionPreferencesStore {
    filePath;
    // Parsed-file cache keyed by mtime. `read()` sits on hot paths now
    // (Config.isMcpServerDisabled is consulted per server during discovery and
    // resource reads), so avoid re-reading/re-parsing when the file hasn't
    // changed; the mtime check keeps cross-process writes visible.
    cache = null;
    constructor(filePath) {
        this.filePath = filePath;
    }
    read() {
        try {
            const { mtimeMs } = fs.statSync(this.filePath);
            if (this.cache?.mtimeMs === mtimeMs) {
                // Clone so callers can mutate the result without corrupting the cache.
                return structuredClone(this.cache.prefs);
            }
            const content = fs.readFileSync(this.filePath, 'utf-8');
            let parsed;
            try {
                parsed = JSON.parse(content);
            }
            catch (parseError) {
                // Only a genuine parse failure means the content is corrupt — move it
                // aside so the next write can't clobber recoverable favorites/scopes.
                // Transient read errors (EACCES/EMFILE/EISDIR/…) fall through to the
                // outer catch, which must NOT quarantine an otherwise-valid file.
                debugLogger.error('Corrupt extension preferences:', parseError);
                quarantineCorruptFile(this.filePath);
                return emptyPreferences();
            }
            const rawScopes = parsed.scopes && typeof parsed.scopes === 'object' ? parsed.scopes : {};
            const scopes = {};
            for (const [name, value] of Object.entries(rawScopes)) {
                if (isExtensionScope(value))
                    scopes[name] = value;
            }
            const rawDisabled = parsed.disabledMcpServers &&
                typeof parsed.disabledMcpServers === 'object'
                ? parsed.disabledMcpServers
                : {};
            const disabledMcpServers = {};
            for (const [name, value] of Object.entries(rawDisabled)) {
                if (Array.isArray(value)) {
                    const servers = value.filter((v) => typeof v === 'string');
                    if (servers.length)
                        disabledMcpServers[name] = servers;
                }
            }
            const prefs = {
                favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
                scopes,
                disabledMcpServers,
            };
            this.cache = { prefs: structuredClone(prefs), mtimeMs };
            return prefs;
        }
        catch (error) {
            if (error instanceof Error &&
                'code' in error &&
                error.code === 'ENOENT') {
                return emptyPreferences();
            }
            // A transient read error (permission/too-many-files/…) — the file may be
            // perfectly valid, so do NOT quarantine it here; only parse failures
            // above do that. Return the default for this read.
            //
            // `debugLogger.error` is gated behind QWEN_DEBUG_LOG_FILE (unset for
            // almost all users), so without an stderr line the user's
            // favorites/scopes would appear to vanish with no trail. Mirror the
            // `quarantineCorruptFile` pattern and surface it on stderr too.
            process.stderr.write(`[warn] Could not read extension preferences at ${this.filePath}: ${error instanceof Error ? error.message : String(error)}. Using defaults for this session.\n`);
            debugLogger.error('Error reading extension preferences:', error);
            return emptyPreferences();
        }
    }
    write(prefs) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        atomicWriteFileSync(this.filePath, JSON.stringify(prefs, null, 2));
        // Drop the cache; the next read re-stats and re-parses the new file.
        this.cache = null;
    }
    isFavorite(name) {
        return this.read().favorites.includes(name);
    }
    getFavorites() {
        return this.read().favorites;
    }
    /**
     * Toggles the favorite state for an item and returns the new state.
     */
    toggleFavorite(name) {
        const prefs = this.read();
        const index = prefs.favorites.indexOf(name);
        let nowFavorite;
        if (index >= 0) {
            prefs.favorites.splice(index, 1);
            nowFavorite = false;
        }
        else {
            prefs.favorites.push(name);
            nowFavorite = true;
        }
        this.write(prefs);
        return nowFavorite;
    }
    getScope(name) {
        return this.read().scopes[name];
    }
    getScopes() {
        return this.read().scopes;
    }
    setScope(name, scope) {
        const prefs = this.read();
        prefs.scopes[name] = scope;
        this.write(prefs);
    }
    /** MCP servers individually disabled inside the given extension. */
    getDisabledMcpServers(extensionName) {
        return this.read().disabledMcpServers[extensionName] ?? [];
    }
    setMcpServerDisabled(extensionName, serverName, disabled) {
        const prefs = this.read();
        const current = prefs.disabledMcpServers[extensionName] ?? [];
        if (disabled) {
            if (current.includes(serverName))
                return;
            prefs.disabledMcpServers[extensionName] = [...current, serverName];
        }
        else {
            if (!current.includes(serverName))
                return;
            const next = current.filter((n) => n !== serverName);
            if (next.length) {
                prefs.disabledMcpServers[extensionName] = next;
            }
            else {
                delete prefs.disabledMcpServers[extensionName];
            }
        }
        this.write(prefs);
    }
    /** Removes all preference state for an extension (used on uninstall). */
    clear(name) {
        const prefs = this.read();
        const favIndex = prefs.favorites.indexOf(name);
        let changed = false;
        if (favIndex >= 0) {
            prefs.favorites.splice(favIndex, 1);
            changed = true;
        }
        if (prefs.scopes[name]) {
            delete prefs.scopes[name];
            changed = true;
        }
        if (prefs.disabledMcpServers[name]) {
            delete prefs.disabledMcpServers[name];
            changed = true;
        }
        if (changed) {
            this.write(prefs);
        }
    }
}
//# sourceMappingURL=extensionPreferences.js.map