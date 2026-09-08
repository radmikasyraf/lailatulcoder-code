/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const DEFAULT_QWEN_CUSTOM_IGNORE_FILE_NAMES: readonly [".agentignore", ".aiignore"];
export declare function normalizeQwenCustomIgnoreFileNames(ignoreFileNames?: readonly string[]): string[];
export declare function getQwenIgnoreFileNames(customIgnoreFileNames?: readonly string[]): string[];
export declare function formatQwenIgnoreFileNames(customIgnoreFileNames?: readonly string[]): string;
export interface QwenIgnoreFilter {
    isIgnored(filePath: string): boolean;
    getIgnoreFileNameForPath(filePath: string): string | undefined;
    getPatterns(): string[];
}
export declare class QwenIgnoreParser implements QwenIgnoreFilter {
    private projectRoot;
    private patterns;
    private readonly ignoreFileNames;
    private readonly sourceIgnorers;
    constructor(projectRoot: string, customIgnoreFileNames?: readonly string[]);
    private loadPatterns;
    isIgnored(filePath: string): boolean;
    getIgnoreFileNameForPath(filePath: string): string | undefined;
    private normalizePathForIgnore;
    getPatterns(): string[];
    getIgnoreFileNames(): string[];
}
