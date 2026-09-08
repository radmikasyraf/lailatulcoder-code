/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
let xtermHeadlessModulePromise;
function isXtermHeadlessModule(candidate) {
    return (candidate !== undefined &&
        'Terminal' in candidate &&
        typeof candidate.Terminal === 'function');
}
export function loadXtermHeadless() {
    xtermHeadlessModulePromise ??= import('@xterm/headless').then((module) => {
        const imported = module;
        const candidate = isXtermHeadlessModule(imported)
            ? imported
            : 'default' in imported
                ? imported.default
                : undefined;
        if (!isXtermHeadlessModule(candidate)) {
            throw new Error('@xterm/headless module does not match the expected API');
        }
        return candidate;
    });
    return xtermHeadlessModulePromise;
}
//# sourceMappingURL=load-xterm-headless.js.map