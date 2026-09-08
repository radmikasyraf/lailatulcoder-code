/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const DEFAULT_CONTEXT_FILENAME = "QWEN.md";
export declare const AGENT_CONTEXT_FILENAME = "AGENTS.md";
/**
 * Per-developer, project-scoped context file. Anchored at
 * `<projectRoot>/.qwen/QWEN.local.md`. Intended to be gitignored so each
 * developer can keep personal instructions (local cluster IDs, account
 * names, paths) without polluting the shared project `QWEN.md` or the
 * global `~/.qwen/QWEN.md`.
 *
 * Unlike `DEFAULT_CONTEXT_FILENAME` / `AGENT_CONTEXT_FILENAME`, this name is
 * NOT part of the hierarchical upward-search list — it is loaded from a
 * single fixed slot, after all other project-level context files, so it can
 * supplement or override shared instructions.
 *
 * Project root is the nearest ancestor containing a `.git` directory OR a
 * `.git` file (the latter marks git worktrees and submodules). If no
 * project root can be found, the slot is skipped — the loader does NOT
 * fall back to cwd, because that would turn a "single fixed slot" into a
 * per-cwd file and (when cwd is the home directory) would collide with
 * the global Qwen dir at `~/.qwen/`.
 */
export declare const LOCAL_CONTEXT_FILENAME = "QWEN.local.md";
export declare const MEMORY_SECTION_HEADER = "## Qwen Added Memories";
export declare function setGeminiMdFilename(newFilename: string | string[]): void;
export declare function getCurrentGeminiMdFilename(): string;
export declare function getAllGeminiMdFilenames(): string[];
