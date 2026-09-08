/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { type RuleFile } from './rulesDiscovery.js';
import type { InstructionLoadReason, InstructionMemoryType } from '../hooks/types.js';
export interface InstructionsLoadedNotification {
    filePath: string;
    memoryType: InstructionMemoryType;
    loadReason: InstructionLoadReason;
    triggerFilePath?: string;
    parentFilePath?: string;
}
/**
 * Renders a context file path for display: relative to the CWD when the
 * file is inside the CWD tree, otherwise a `~/...` shortcut when the file
 * lives under the user home (instead of a long `../../..` chain). Output
 * is sanitized because directory names are attacker-influenceable.
 */
export declare function formatContextFileDisplayPath(filePath: string, currentWorkingDirectory: string, userHomePath?: string): string;
export interface LoadServerHierarchicalMemoryResponse {
    memoryContent: string;
    fileCount: number;
    /**
     * Display paths of the loaded context (memory) files: CWD-relative when
     * inside the CWD tree, `~/...` shortcuts for files under the user home.
     * Display-only — do not resolve them against the CWD.
     * Lets callers tell users which files were actually attached (see #5267).
     * Top-level files only: content pulled in via `@import` is inlined into
     * the importing file and is not listed separately.
     * Baseline rules (`.qwen/rules/`) are injected separately and deliberately
     * not listed here (see `ruleCount`).
     */
    contextFilePaths: string[];
    /** Number of baseline rules injected at session start. */
    ruleCount: number;
    /** Conditional rules (with `paths:`) for turn-level lazy injection. */
    conditionalRules: RuleFile[];
    /** Effective project root used for glob matching. */
    projectRoot: string;
}
export interface LoadServerHierarchicalMemoryOptions {
    explicitOnly?: boolean;
    loadReason?: Exclude<InstructionLoadReason, 'include'>;
    onInstructionsLoaded?: (notification: InstructionsLoadedNotification) => void | Promise<void>;
}
/**
 * Loads hierarchical QWEN.md files and concatenates their content.
 * Also loads path-based context rules from `.qwen/rules/` directories.
 * This function is intended for use by the server.
 *
 * @param contextRuleExcludes - Glob patterns to skip when loading rules.
 */
export declare function loadServerHierarchicalMemory(currentWorkingDirectory: string, includeDirectoriesToReadGemini: readonly string[], fileService: FileDiscoveryService, extensionContextFilePaths: string[] | undefined, folderTrust: boolean, importFormat?: 'flat' | 'tree', contextRuleExcludes?: string[], options?: LoadServerHierarchicalMemoryOptions): Promise<LoadServerHierarchicalMemoryResponse>;
