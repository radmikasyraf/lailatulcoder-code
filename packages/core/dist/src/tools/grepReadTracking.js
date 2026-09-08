/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createDebugLogger } from '../utils/debugLogger.js';
const STAT_BATCH_SIZE = 50;
const NON_CACHEABLE_GREP_EXTENSIONS = new Set(['.ipynb']);
const debugLogger = createDebugLogger('GREP_READ_TRACKING');
export async function recordGrepResultFileReads(config, filePaths) {
    if (config.getFileReadCacheDisabled?.()) {
        return;
    }
    const cache = config.getFileReadCache?.();
    if (!cache) {
        return;
    }
    const uniqueFilePaths = Array.from(new Set(filePaths));
    for (let i = 0; i < uniqueFilePaths.length; i += STAT_BATCH_SIZE) {
        const batch = uniqueFilePaths.slice(i, i + STAT_BATCH_SIZE);
        await Promise.all(batch.map(async (filePath) => {
            try {
                const stats = await fs.stat(filePath);
                if (!stats.isFile()) {
                    return;
                }
                cache.recordRead(filePath, stats, {
                    full: false,
                    cacheable: isGrepResultCacheable(filePath),
                });
            }
            catch (error) {
                if (error.code !== 'ENOENT') {
                    debugLogger.debug('Failed to stat grep result path', filePath, error);
                }
            }
        }));
    }
}
function isGrepResultCacheable(filePath) {
    return !NON_CACHEABLE_GREP_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
//# sourceMappingURL=grepReadTracking.js.map