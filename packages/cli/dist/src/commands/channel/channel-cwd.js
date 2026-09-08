/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'node:path';
import { resolvePath } from '@lailatul-coder/channel-base';
function isHomeRelative(value) {
    return value === '~' || value.startsWith('~/') || value.startsWith('~\\');
}
export function resolveChannelCwd(rawCwd, defaultCwd) {
    if (!rawCwd)
        return resolvePath(defaultCwd);
    if (isHomeRelative(rawCwd))
        return resolvePath(rawCwd);
    return path.resolve(defaultCwd, rawCwd);
}
//# sourceMappingURL=channel-cwd.js.map