/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * True when two paths name the same file. Where both exist, filesystem
 * identity (dev/ino) decides: hard links and case-variant spellings are one
 * file under names no string compare sees through, and statSync follows a
 * symlinked directory component on the way to the file. Where a side is
 * absent, the deepest existing ancestor is canonicalised instead, keeping
 * the comparison honest for files a command is about to create.
 */
export declare function isSameFile(left: string, right: string): boolean;
