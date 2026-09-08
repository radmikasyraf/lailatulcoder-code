/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
/**
 * Derives a stable artifact id from the source fragment's file path. Identity
 * is keyed by path so re-publishing an edited file redeploys to the same URL;
 * a different path mints a new artifact.
 */
export function artifactIdFromPath(filePath) {
    const normalized = path.resolve(filePath);
    return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}
//# sourceMappingURL=publisher.js.map