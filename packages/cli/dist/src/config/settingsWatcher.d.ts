/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type LoadedSettings, SettingScope } from './settings.js';
export interface SettingsChangeEvent {
    scope: SettingScope;
    path: string;
    changeType: 'modified' | 'created' | 'deleted';
}
export type SettingsChangeListener = (events: SettingsChangeEvent[]) => void | Promise<void>;
/**
 * Watches user and workspace settings.json files for changes and emits
 * change events when the resolved settings content differs from the
 * in-memory state.
 *
 * Uses chokidar to monitor the `.qwen` directory (depth: 0) with strict
 * basename filtering. Self-writes from `LoadedSettings.setValue()` are
 * naturally suppressed via a before/after semantic diff — `setValue()`
 * mutates memory before writing disk, so `reloadScopeFromDisk()` produces
 * no diff.
 *
 * Restart-required settings are filtered out before notifying: if every
 * changed key is `requiresRestart` in the schema (credentials, `env`,
 * providers, MCP servers, …), no event is emitted, since such values are read
 * once at startup and cannot take effect without a restart.
 *
 * The watcher never creates `.qwen` itself. When the directory is missing at
 * startup it bootstrap-watches the parent (depth: 0, `.qwen`-only filter) and
 * promotes to watching `.qwen` once it appears — so a `settings.json` added
 * later in the session is still detected without recursing the project tree.
 */
export declare class SettingsWatcher {
    private readonly settings;
    private readonly watchers;
    /**
     * Per-scope watch stage. `bootstrap` watches the parent directory waiting
     * for the missing `.qwen` dir to appear; `target` watches `.qwen` itself.
     */
    private readonly watchStage;
    /**
     * Per-scope generation token. Bumped on every promote/demote so that a
     * stale `'all'` callback from a watcher being torn down (chokidar `close()`
     * is async) becomes a no-op instead of stacking watchers.
     */
    private readonly watchGeneration;
    private readonly changeListeners;
    private refreshTimer;
    private readonly pendingScopeChanges;
    private processing;
    private started;
    static readonly DEBOUNCE_MS = 300;
    static readonly LISTENER_TIMEOUT_MS = 30000;
    constructor(settings: LoadedSettings);
    startWatching(): void;
    /**
     * Watches the resolved `.qwen` directory for changes to `settings.json`.
     * If `.qwen` itself is removed, demotes back to a parent bootstrap watcher
     * so a later re-creation is still caught.
     */
    private watchTargetDir;
    /**
     * Bootstrap watcher: monitors the parent directory (depth 0) with a strict
     * predicate that only allows the `.qwen` entry through, so unrelated
     * top-level churn is suppressed and the project tree is never recursed.
     * Promotes to a target watcher once `.qwen` appears.
     */
    private watchParentForDir;
    /** Swaps a scope's bootstrap watcher for a target watcher on `.qwen`. */
    private promoteScope;
    /** Swaps a scope's target watcher back to a parent bootstrap watcher. */
    private demoteScope;
    /**
     * Bumps the scope generation and closes its current watcher, clearing the
     * map entries before the caller opens the next watcher. Bumping first makes
     * any in-flight callback from the closing watcher a no-op.
     */
    private replaceWatcher;
    private bumpGeneration;
    stopWatching(): void;
    addChangeListener(listener: SettingsChangeListener): () => void;
    private getScopePaths;
    private scheduleRefresh;
    private drainPendingChanges;
    private handleChange;
    private notifyListeners;
}
