/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Diff from 'diff';
import type { DiffStat } from './tools.js';
export declare const DEFAULT_DIFF_OPTIONS: Diff.PatchOptions;
/**
 * Returns true when the unified diff patch string contains at least one hunk.
 */
export declare function hasHunks(patch: string): boolean;
/**
 * Creates a unified diff patch with smart whitespace handling.
 *
 * Uses ignoreWhitespace:true first to produce clean diffs when content and
 * whitespace change together. Falls back to ignoreWhitespace:false when no
 * hunks are found, so that whitespace-only edits (e.g. re-indentation) still
 * produce a visible diff instead of "No changes detected".
 */
export declare function createPatchSmart(filename: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string): string;
export declare function getDiffStat(fileName: string, oldStr: string, aiStr: string, userStr: string): DiffStat;
