/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Test files a runner named as failing, out of one command's output.
 *
 * Two shapes cover vitest and jest, the runners build-test drives:
 * `FAIL  src/x.test.ts > name` (both, in the failure section) and vitest's
 * per-file `❯ src/x.test.ts (12 tests | 3 failed)` progress line. Matching is
 * on the path token, so a `FAIL` line whose path was truncated mid-token by
 * output trimming simply does not match — an unparsed failure surfaces as a
 * count mismatch in the caller's disclosure, never as an invented path.
 */
export declare function failingFilesOf(output: string, root?: string): string[];
/** Strip the run's own root (and any leading `./`) so the two sides compare. */
export declare function relativeToRoot(file: string, root: string): string;
