/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
export interface ReloadPluginsSummary {
    extensionCount: number;
    commandCount: number;
    skillCount: number;
    agentCount: number;
    hookCount: number;
    mcpServerCount: number;
    lspServerCount: number;
}
export declare function reloadPluginsRuntime(options: {
    config: Config;
    reloadCommands?: () => void | Promise<void>;
}): Promise<ReloadPluginsSummary>;
export declare function refreshExtensionContentRuntime(options: {
    config: Config;
    reloadCommands?: () => void | Promise<void>;
}): Promise<void>;
