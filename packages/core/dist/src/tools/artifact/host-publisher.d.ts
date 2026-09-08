/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ArtifactHostConfig, ArtifactPublisher, PublishArtifactInput, PublishedArtifact } from './publisher.js';
/** Runs the upload command. Injectable so tests don't spawn processes. */
export type RunCommand = (command: string, args: string[], signal?: AbortSignal) => Promise<void>;
/**
 * Splits a command string into argv, honoring single/double quotes. The result
 * is executed with `execFile` (no shell), so placeholder values cannot inject
 * extra commands. Throws on an unterminated quote.
 */
export declare function tokenizeCommand(command: string): string[];
/**
 * Option C: uploads the artifact via a user-configured command and returns the
 * shareable URL. The remote key is `{prefix}/{id}/index.html` (id = source path
 * hash), so it is deterministic — re-publishing overwrites the same key and the
 * URL stays stable.
 */
export declare class HostPublisher implements ArtifactPublisher {
    private readonly config;
    private readonly run;
    readonly kind = "host";
    constructor(config: ArtifactHostConfig, run?: RunCommand);
    publish(input: PublishArtifactInput, signal?: AbortSignal): Promise<PublishedArtifact>;
}
