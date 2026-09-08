/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../../config/config.js';
/**
 * Saved-workflow name constraint. Lower-case, digits, hyphens; must start
 * with a letter. The name doubles as the `.js` filename stem AND the slash
 * command name (`deep-research.js` → `/deep-research`), so it must be safe
 * for both a path segment and a command token (no spaces, dots, slashes).
 */
export declare const WORKFLOW_NAME_PATTERN: RegExp;
export type SavedWorkflowSource = 'project' | 'user';
/** One discovered saved-workflow script (metadata only — no source read). */
export interface SavedWorkflowEntry {
    /** Filename stem, e.g. `deep-research`. Doubles as the slash command name. */
    name: string;
    /** Absolute path to the `.js` file. */
    scriptPath: string;
    /** Which scope the file was found in. */
    source: SavedWorkflowSource;
}
/** A resolved saved workflow with its script source loaded. */
export interface ResolvedSavedWorkflow {
    name: string;
    scriptPath: string;
    script: string;
}
/** Result of a {@link saveWorkflowScript} attempt. */
export type WorkflowSaveResult = {
    status: 'saved';
    name: string;
    scope: SavedWorkflowSource;
    path: string;
} | {
    status: 'exists';
    name: string;
    scope: SavedWorkflowSource;
    path: string;
} | {
    status: 'invalid-name';
    error: string;
} | {
    status: 'empty-script';
    error: string;
};
/**
 * Validate a saved-workflow name. Returns an error string when invalid,
 * `null` when OK. Shared by the save dialog (CLI) and any caller that
 * accepts a user-supplied name.
 */
export declare function validateWorkflowName(name: string): string | null;
/** Both scope directories, project first (higher precedence). */
export declare function getSavedWorkflowDirs(config: Config): Array<{
    dir: string;
    source: SavedWorkflowSource;
}>;
/**
 * Enumerate all saved workflows across both scopes. Project entries shadow
 * same-named user entries (project wins). Sorted by name for stable
 * slash-command ordering.
 */
export declare function listSavedWorkflows(config: Config): Promise<SavedWorkflowEntry[]>;
/**
 * Resolve `workflow('<name>')` or `workflow({scriptPath})` to a loaded
 * script. The string form looks up `<name>.js` in project then user scope;
 * the `{scriptPath}` form reads the file at the given path directly.
 *
 * Throws with an actionable, available-names message on a miss — the
 * message text mirrors upstream so scripts written against either runtime
 * see the same error.
 */
export declare function resolveSavedWorkflowScript(nameOrRef: string | {
    scriptPath: string;
}, config: Config): Promise<ResolvedSavedWorkflow>;
/**
 * Save a workflow script to `.qwen/workflows/<name>.js` (project) or
 * `~/.qwen/workflows/<name>.js` (user). Powers the `/workflows` save dialog.
 *
 * Validates the name and refuses to clobber an existing file unless
 * `overwrite` is set (the dialog uses the `exists` result to prompt for
 * confirmation, then retries with `overwrite: true`). Returns a discriminated
 * result rather than throwing on the expected user-facing failures
 * (invalid name, empty script, name collision); only a genuine I/O failure
 * (mkdir / writeFile) rejects.
 */
export declare function saveWorkflowScript(config: Config, opts: {
    name: string;
    scope: SavedWorkflowSource;
    script: string;
    overwrite?: boolean;
}): Promise<WorkflowSaveResult>;
