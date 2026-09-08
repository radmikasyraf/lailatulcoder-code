/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Discovers saved workflow scripts under `.qwen/workflows/`
 * (project) and `~/.qwen/workflows/` (user) and exposes each as a `/<name>`
 * slash command that dispatches the `workflow` tool with the file's path.
 * The script is read at execution time (by the tool), so edits to a saved
 * workflow take effect on the next invocation.
 *
 * Enumeration, project-over-user precedence, and the name constraint all live
 * in core's `listSavedWorkflows` — the single source of truth shared with the
 * `workflow('<name>')` in-script global. This loader only adapts the
 * discovered entries into `SlashCommand` objects.
 */
import type { Config } from '@lailatul-coder/lailatul-coder-core';
import type { ICommandLoader } from './types.js';
import type { SlashCommand } from '../ui/commands/types.js';
export declare class SavedWorkflowLoader implements ICommandLoader {
    private readonly config;
    constructor(config: Config | null);
    loadCommands(signal: AbortSignal): Promise<SlashCommand[]>;
    private toCommand;
}
