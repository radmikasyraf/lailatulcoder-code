/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../../config/config.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool } from '../tools.js';
import { type ArtifactPublisher } from './publisher.js';
/** Opens a URL in the browser. Injectable so tests don't launch a browser. */
export type UrlOpener = (url: string, options: {
    allowFile: boolean;
    allowedFilePaths: string[];
}) => Promise<void>;
export interface ArtifactToolParams {
    /** Absolute path to the body-only HTML fragment file to publish. */
    file_path: string;
    /** Concise title for the artifact (browser tab / listing). */
    title?: string;
}
/**
 * The Artifact tool: publishes a self-contained HTML fragment as an interactive
 * page and opens it. The backend is pluggable via {@link ArtifactPublisher}
 * (local file://, a custom upload command, or native OSS).
 */
export declare class ArtifactTool extends BaseDeclarativeTool<ArtifactToolParams, ToolResult> {
    private readonly config;
    private readonly openUrl;
    static readonly Name: string;
    private readonly publisher;
    constructor(config: Config, publisher?: ArtifactPublisher, openUrl?: UrlOpener);
    protected validateToolParamValues(params: ArtifactToolParams): string | null;
    toAutoClassifierInput(params: ArtifactToolParams): Record<string, unknown>;
    protected createInvocation(params: ArtifactToolParams): ToolInvocation<ArtifactToolParams, ToolResult>;
}
