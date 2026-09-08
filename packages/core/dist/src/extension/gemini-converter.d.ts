/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ExtensionConfig } from './extensionManager.js';
import type { ExtensionSetting } from './extensionSettings.js';
export interface GeminiExtensionConfig {
    name: string;
    version: string;
    mcpServers?: Record<string, unknown>;
    contextFileName?: string | string[];
    settings?: ExtensionSetting[];
}
/**
 * Converts a Gemini extension config to LailatulCoder Ai format.
 * @param extensionDir Path to the Gemini extension directory
 * @returns Qwen ExtensionConfig
 */
export declare function convertGeminiToQwenConfig(extensionDir: string): ExtensionConfig;
/**
 * Converts a complete Gemini extension package to LailatulCoder Ai format.
 * Creates a new temporary directory with:
 * 1. Converted qwen-extension.json
 * 2. Commands converted from TOML to MD
 * 3. All other files/folders preserved
 *
 * @param extensionDir Path to the Gemini extension directory
 * @returns Object containing converted config and the temporary directory path
 */
export declare function convertGeminiExtensionPackage(extensionDir: string): Promise<{
    config: ExtensionConfig;
    convertedDir: string;
}>;
/**
 * True when `child` equals or is nested under `parent`. Both must already be
 * absolute, resolved paths. Shared containment primitive for the symlink
 * confinement guards (kept in one place so the rule can't drift between files).
 */
export declare function isPathWithin(child: string, parent: string): boolean;
/**
 * True when `target` exists and its real (symlink-resolved) path stays within
 * `root`'s real path. Both sides are resolved with `fs.realpathSync` so a
 * symlink in an untrusted source cannot point a read/copy at a file outside
 * the package. Returns false for missing or broken paths.
 */
export declare function realPathWithin(target: string, root: string): boolean;
/**
 * Recursively copies a directory and its contents.
 * @param source Source directory path
 * @param destination Destination directory path
 * @param confineRoot If set, any symlink whose real target escapes this
 *   directory is skipped. Defaults to `fs.realpathSync(source)` when omitted.
 *   Always pass this explicitly when `source` originates from untrusted input.
 */
export declare function copyDirectory(source: string, destination: string, confineRoot?: string): Promise<void>;
/**
 * Checks if a config object is in Gemini format.
 * This is a heuristic check based on typical Gemini extension patterns.
 * @param config Configuration object to check
 * @returns true if config appears to be Gemini format
 */
export declare function isGeminiExtensionConfig(extensionDir: string): boolean;
