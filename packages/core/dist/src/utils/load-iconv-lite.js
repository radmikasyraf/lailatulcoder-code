/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
let iconvLiteModulePromise;
function isIconvLite(candidate) {
    return ('decode' in candidate &&
        typeof candidate.decode === 'function' &&
        'encode' in candidate &&
        typeof candidate.encode === 'function' &&
        'encodingExists' in candidate &&
        typeof candidate.encodingExists === 'function');
}
export function loadIconvLite() {
    iconvLiteModulePromise ??= import('iconv-lite').then((module) => {
        const imported = module;
        const candidate = 'default' in imported && imported.default ? imported.default : imported;
        if (!isIconvLite(candidate)) {
            throw new Error('iconv-lite module does not match the expected API');
        }
        return candidate;
    });
    return iconvLiteModulePromise;
}
//# sourceMappingURL=load-iconv-lite.js.map