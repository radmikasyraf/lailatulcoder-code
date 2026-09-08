/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type MCPServerConfig } from '@lailatul-coder/lailatul-coder-core';
import { SettingScope, type LoadedSettings } from './settings.js';
export type ClaudeMcpImportSource = 'all' | 'claude-code' | 'claude-desktop';
export type ClaudeMcpImportScope = 'user' | 'project';
export interface ClaudeMcpImportOptions {
    source: ClaudeMcpImportSource;
    scope: ClaudeMcpImportScope;
    settings: LoadedSettings;
    cwd?: string;
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
}
export interface ClaudeMcpSourceResult {
    source: Exclude<ClaudeMcpImportSource, 'all'>;
    label: string;
    path: string;
    servers: Record<string, MCPServerConfig>;
    errors: string[];
    found: boolean;
}
export interface ImportedClaudeMcpServer {
    name: string;
    source: string;
}
export interface SkippedClaudeMcpServer {
    name: string;
    source: string;
    reason: 'already-exists' | 'reserved-name';
}
export interface ClaudeMcpImportResult {
    scope: ClaudeMcpImportScope;
    settingScope: SettingScope.User | SettingScope.Workspace;
    scanned: ClaudeMcpSourceResult[];
    imported: ImportedClaudeMcpServer[];
    skipped: SkippedClaudeMcpServer[];
    errors: string[];
}
export declare function getClaudeCodeConfigPath(homeDir?: string): string;
export declare function getClaudeDesktopConfigPath(homeDir?: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
export declare function loadClaudeMcpSources(options: Pick<ClaudeMcpImportOptions, 'source' | 'cwd' | 'homeDir' | 'env' | 'platform'> & Partial<Pick<ClaudeMcpImportOptions, 'scope'>>): ClaudeMcpSourceResult[];
export declare function importClaudeMcpServers(options: ClaudeMcpImportOptions): ClaudeMcpImportResult;
