/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const SETTINGS_DIRECTORY_NAME = ".qwen";
export declare function resolveConfigPathLite(dir: string, cwd?: string): string;
export declare function getGlobalQwenDirLite(): string;
export declare function getSystemSettingsPath(): string;
export declare function getSystemDefaultsPath(): string;
