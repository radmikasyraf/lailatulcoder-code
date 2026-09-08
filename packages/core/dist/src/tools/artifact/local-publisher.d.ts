/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ArtifactPublisher, PublishArtifactInput, PublishedArtifact } from './publisher.js';
/**
 * Option B: writes the artifact to the local Qwen home and returns a file://
 * URL. No network, no sharing — the page opens directly in the browser. Keyed
 * by id under `~/.qwen/artifacts/{id}/index.html`, so redeploys overwrite in
 * place and keep the same URL.
 */
export declare class LocalPublisher implements ArtifactPublisher {
    private readonly baseDir?;
    readonly kind = "local";
    /** @param baseDir Override the output root (defaults to ~/.qwen/artifacts). */
    constructor(baseDir?: string | undefined);
    private getBaseDir;
    publish(input: PublishArtifactInput): Promise<PublishedArtifact>;
}
