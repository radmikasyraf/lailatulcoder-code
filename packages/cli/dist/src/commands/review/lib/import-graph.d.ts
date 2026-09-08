/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** File-reading seam: the incremental scope passes worktree reads, tests pass a map. */
export type SourceReader = (repoRelPath: string) => string | null;
/**
 * Every module specifier the source mentions, deduplicated, order preserved.
 *
 * Four shapes: `import … from 'x'` / `export … from 'x'` (one regex — both
 * end in `from '<spec>'`), side-effect `import 'x'`, dynamic `import('x')`,
 * and CommonJS `require('x')`. Template-literal specifiers are dynamic values
 * and are ignored, as is anything spanning a newline.
 */
export declare function scanImportSpecifiers(source: string): string[];
/**
 * A workspace package the resolver may route bare specifiers into:
 * `name` from its manifest, `dir` repo-relative (`''` for the root package).
 */
export interface WorkspacePackage {
    name: string;
    dir: string;
}
/**
 * Resolve one specifier to a repo-relative path, or null.
 *
 * `membership` is the only truth consulted — resolution never stats the disk.
 * The caller passes the set of paths it cares about (the review plan's files),
 * so "resolved" means "this specifier names a file in the review", which is
 * the exact question widening asks.
 */
export declare function resolveSpecifier(fromFile: string, spec: string, membership: ReadonlySet<string>, packages?: readonly WorkspacePackage[]): string | null;
/**
 * Discover the workspace packages the plan's files live in.
 *
 * For each file, the nearest ancestor directory whose `package.json` the
 * reader can produce a `name` from is its package; distinct packages are
 * returned root-last so `resolveSpecifier`'s first-match loop sees the most
 * specific dir first. The reader is a seam (worktree reads in production),
 * and every miss is fail-quiet: a file under no readable manifest simply
 * contributes no package, which only ever narrows the widening.
 */
export declare function discoverWorkspacePackages(files: readonly string[], readJson: (repoRelPath: string) => string | null): WorkspacePackage[];
/**
 * Which candidates import a changed file — the widening set.
 *
 * Returns `candidate → the changed files it imports` (non-empty lists only),
 * insertion-ordered by the candidates array. Candidates already in `changed`
 * are skipped: they are in the scope on their own account. A candidate whose
 * source cannot be read (deleted, binary, reader refused) contributes no
 * edges — same fail-quiet floor as every other miss here.
 */
export declare function dependentsOfChanged(changed: ReadonlySet<string>, candidates: readonly string[], read: SourceReader, packages?: readonly WorkspacePackage[]): Map<string, string[]>;
