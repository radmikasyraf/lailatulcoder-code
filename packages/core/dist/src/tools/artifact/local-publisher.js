/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Storage } from '../../config/storage.js';
/**
 * Option B: writes the artifact to the local Qwen home and returns a file://
 * URL. No network, no sharing — the page opens directly in the browser. Keyed
 * by id under `~/.lailatulcoder/artifacts/{id}/index.html`, so redeploys overwrite in
 * place and keep the same URL.
 */
export class LocalPublisher {
    baseDir;
    kind = 'local';
    /** @param baseDir Override the output root (defaults to ~/.lailatulcoder/artifacts). */
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    getBaseDir() {
        return this.baseDir ?? path.join(Storage.getGlobalQwenDir(), 'artifacts');
    }
    async publish(input) {
        const dir = path.join(this.getBaseDir(), input.id);
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, 'index.html');
        await fs.writeFile(filePath, input.html, 'utf8');
        return {
            id: input.id,
            url: pathToFileURL(filePath).href,
            filePath,
        };
    }
}
//# sourceMappingURL=local-publisher.js.map