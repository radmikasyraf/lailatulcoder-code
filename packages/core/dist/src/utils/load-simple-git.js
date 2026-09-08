/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
let simpleGitModulePromise;
function isSimpleGitModule(candidate) {
    return (candidate !== undefined &&
        'simpleGit' in candidate &&
        typeof candidate.simpleGit === 'function' &&
        'CheckRepoActions' in candidate &&
        typeof candidate.CheckRepoActions === 'object' &&
        candidate.CheckRepoActions !== null);
}
export function loadSimpleGit() {
    simpleGitModulePromise ??= import('simple-git').then((module) => {
        const imported = module;
        const candidate = isSimpleGitModule(imported)
            ? imported
            : 'default' in imported
                ? imported.default
                : undefined;
        if (!isSimpleGitModule(candidate)) {
            throw new Error('simple-git module does not match the expected API');
        }
        return {
            CheckRepoActions: candidate.CheckRepoActions,
            simpleGit: candidate.simpleGit,
        };
    });
    return simpleGitModulePromise;
}
//# sourceMappingURL=load-simple-git.js.map