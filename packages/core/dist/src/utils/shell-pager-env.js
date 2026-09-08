/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export function getDefaultShellPager(platform = process.platform) {
    return platform === 'win32' ? undefined : 'cat';
}
export function getShellPagerEnv(pager, options = {}) {
    const effectivePager = pager ?? getDefaultShellPager(options.platform);
    if (!effectivePager) {
        return {
            PAGER: '',
            ...(options.includeGitPager ? { GIT_PAGER: '' } : {}),
        };
    }
    return {
        PAGER: effectivePager,
        ...(options.includeGitPager ? { GIT_PAGER: effectivePager } : {}),
    };
}
//# sourceMappingURL=shell-pager-env.js.map