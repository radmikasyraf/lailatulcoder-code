/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { dependentsOfChanged, discoverWorkspacePackages, } from './import-graph.js';
/**
 * Widen a narrowing by one import hop.
 *
 * This never declines and never narrows: with nothing to pull in it returns
 * exactly the paths the narrowing selected, so the unwidened round is the
 * floor rather than a separate path that could disagree with it.
 */
export function widenScope(input) {
    const { anchor, selection, readWorktree } = input;
    const touched = new Set(selection.touched);
    // Test and docs dependents stay out: re-running tests is `build-test`'s job,
    // and prose does not call functions.
    const candidates = selection.sections
        .filter((f) => f.kind === 'source' && !f.binary && !touched.has(f.path))
        .map((f) => f.path);
    const packages = discoverWorkspacePackages([...touched, ...candidates], readWorktree);
    const interaction = dependentsOfChanged(touched, candidates, readWorktree, packages);
    const paths = new Set([...touched, ...interaction.keys()]);
    return {
        paths,
        scope: {
            anchor,
            deltaFiles: [...touched].sort(),
            interaction: [...interaction.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([path, importsChanged]) => ({ path, importsChanged })),
            contextFileCount: candidates.filter((p) => !interaction.has(p)).length,
        },
    };
}
//# sourceMappingURL=incremental-scope.js.map