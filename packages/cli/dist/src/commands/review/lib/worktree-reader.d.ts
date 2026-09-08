/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** Reads repo-relative paths under `root`, refusing anything that escapes. */
export declare function containedWorktreeReader(root: string): (repoRelPath: string) => string | null;
