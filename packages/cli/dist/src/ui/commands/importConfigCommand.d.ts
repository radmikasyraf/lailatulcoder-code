/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ClaudeMcpImportResult, type ClaudeMcpImportScope, type ClaudeMcpImportSource } from '../../config/claudeMcpImport.js';
import type { MessageActionReturn, SlashCommand } from './types.js';
interface ParsedImportConfigArgs {
    source: ClaudeMcpImportSource;
    sourceExplicit: boolean;
    scope: ClaudeMcpImportScope;
    help: boolean;
    error?: string;
}
export declare function parseImportConfigArgs(args: string): ParsedImportConfigArgs;
export declare function resolveImportSourceForScope(source: ClaudeMcpImportSource, scope: ClaudeMcpImportScope, sourceExplicit: boolean): ClaudeMcpImportSource;
export declare function formatClaudeMcpImportResult(result: ClaudeMcpImportResult): MessageActionReturn;
export declare const importConfigCommand: SlashCommand;
export {};
