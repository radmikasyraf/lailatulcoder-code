/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { ToolErrorType } from '../tool-error.js';
import { ToolNames, ToolDisplayNames } from '../tool-names.js';
import { makeRelative, shortenPath, unescapePath } from '../../utils/paths.js';
import { getErrorMessage, isAbortError, isNodeError, } from '../../utils/errors.js';
import { openBrowserSecurely } from '../../utils/secure-browser-launcher.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
import { MAX_ARTIFACT_BYTES, byteLength, sanitizeArtifactTitle, validateSelfContained, wrapArtifactHtml, } from './html.js';
import { artifactIdFromPath } from './publisher.js';
import { createArtifactPublisher } from './create-publisher.js';
const DESCRIPTION = `Publishes a self-contained HTML page as an interactive Artifact, optionally opens it in the browser depending on settings, and returns a shareable link when a remote host is configured. Use it to turn session output into a durable, interactive page — a PR walkthrough, an architecture tour, a project dashboard.

Workflow:
- Write the page to a file first (via Write/Edit), then call Artifact with that file's absolute path.
- Write a BODY-ONLY fragment: no <!doctype>, <html>, <head>, or <body> tags — they are added at publish time, along with a minimal CSS reset.
- Self-contained only: inline all CSS and JS; embed images/fonts as data: URIs. No external scripts, stylesheets, fonts, or remote images.
- Responsive: relative units, flex/grid, max-width:100% on media; wide content (tables, diagrams, code) scrolls inside its own overflow-x:auto container.
- Set a concise \`title\` — it names the browser tab.

To update an artifact, call Artifact again with the SAME file path: it redeploys to the same URL. A different path creates a separate Artifact.

Set artifact.autoOpen=false in settings.json, or QWEN_ARTIFACT_NO_AUTO_OPEN=1, to publish without launching a browser.`;
const debugLogger = createDebugLogger('artifact');
function cancelledArtifactResult() {
    const message = 'Artifact publishing was cancelled.';
    return {
        llmContent: message,
        returnDisplay: message,
    };
}
class ArtifactToolInvocation extends BaseToolInvocation {
    config;
    publisher;
    openUrl;
    shouldAutoOpen;
    constructor(config, publisher, openUrl, params) {
        super(params);
        this.config = config;
        this.publisher = publisher;
        this.openUrl = openUrl;
        this.shouldAutoOpen = config.shouldAutoOpenArtifact();
    }
    getDescription() {
        const relativePath = makeRelative(this.params.file_path, this.config.getTargetDir());
        return `Publishing artifact from ${shortenPath(relativePath)}`;
    }
    /** Publishing writes outside the project and may open a browser — always ask. */
    getDefaultPermission() {
        return Promise.resolve('ask');
    }
    getConfirmationDetails(_abortSignal) {
        const relativePath = makeRelative(this.params.file_path, this.config.getTargetDir());
        const backendLabel = this.publisher.kind === 'host' ? 'custom upload' : this.publisher.kind;
        const openSuffix = this.shouldAutoOpen
            ? ' and open it in your browser'
            : '';
        const remoteOpenSuffix = this.shouldAutoOpen
            ? ' and opens the shareable link in your browser'
            : '';
        // Remote backends (host/oss) upload the HTML to a server and hand back a
        // shareable link — say so in the prompt so the user knows the page leaves
        // their machine before they approve.
        const prompt = this.publisher.kind === 'local'
            ? `Publish ${shortenPath(relativePath)} as an interactive Artifact${openSuffix}.`
            : `Publish ${shortenPath(relativePath)} as an interactive Artifact. This uploads the page to a remote host (${backendLabel})${remoteOpenSuffix}.`;
        const details = {
            type: 'info',
            title: 'Publish Artifact',
            prompt,
            onConfirm: async () => {
                // Persistence handled by coreToolScheduler via PM rules.
            },
        };
        return Promise.resolve(details);
    }
    async execute(signal) {
        const { file_path } = this.params;
        // Read the fragment the model wrote.
        let fragment;
        try {
            const { content, _meta } = await this.config
                .getFileSystemService()
                .readTextFile({
                path: file_path,
                maxOutputBytes: MAX_ARTIFACT_BYTES,
                signal,
            });
            if (_meta?.truncatedByBytes === true) {
                const message = `Artifact is too large (source exceeds the ${MAX_ARTIFACT_BYTES} byte limit). Trim the content or split it across multiple artifacts.`;
                return {
                    llmContent: message,
                    returnDisplay: message,
                    error: { message, type: ToolErrorType.FILE_TOO_LARGE },
                };
            }
            fragment = content;
        }
        catch (err) {
            if (signal.aborted || isAbortError(err)) {
                return cancelledArtifactResult();
            }
            const notFound = isNodeError(err) && err.code === 'ENOENT';
            const message = notFound
                ? `Artifact source file not found: ${file_path}. Write the page content to this file first.`
                : `Error reading artifact source file '${file_path}': ${getErrorMessage(err)}`;
            return {
                llmContent: message,
                returnDisplay: message,
                error: {
                    message,
                    type: notFound
                        ? ToolErrorType.FILE_NOT_FOUND
                        : ToolErrorType.READ_CONTENT_FAILURE,
                },
            };
        }
        // Reject external dependencies / full-document wrappers.
        const contentError = validateSelfContained(fragment);
        if (contentError) {
            return {
                llmContent: contentError,
                returnDisplay: contentError,
                error: { message: contentError, type: ToolErrorType.EXECUTION_FAILED },
            };
        }
        const title = sanitizeArtifactTitle(this.params.title ?? path.basename(file_path).replace(/\.html?$/i, ''));
        const html = wrapArtifactHtml(fragment, title);
        // Enforce the size cap on the published document.
        const bytes = byteLength(html);
        if (bytes > MAX_ARTIFACT_BYTES) {
            const message = `Artifact is too large (${bytes} bytes > ${MAX_ARTIFACT_BYTES} byte limit). Trim the content or split it across multiple artifacts.`;
            return {
                llmContent: message,
                returnDisplay: message,
                error: { message, type: ToolErrorType.FILE_TOO_LARGE },
            };
        }
        // Publish (idempotent per source path → stable URL).
        let managedId;
        let url;
        let filePath;
        try {
            const published = await this.publisher.publish({ id: artifactIdFromPath(file_path), title, html }, signal);
            managedId = published.id;
            url = published.url;
            filePath = published.filePath;
        }
        catch (err) {
            // A user-initiated cancel (Esc / aborted signal) is not a failure —
            // surface it as a cancellation rather than a publish error.
            if (signal.aborted || isAbortError(err)) {
                return cancelledArtifactResult();
            }
            const message = `Failed to publish artifact: ${getErrorMessage(err)}`;
            return {
                llmContent: message,
                returnDisplay: message,
                error: { message, type: ToolErrorType.EXECUTION_FAILED },
            };
        }
        // Open in the browser unless disabled. Best-effort: never fail the publish
        // because the browser could not be launched.
        if (this.shouldAutoOpen) {
            try {
                await this.openUrl(url, {
                    allowFile: true,
                    allowedFilePaths: filePath ? [filePath] : [],
                });
            }
            catch (err) {
                debugLogger.warn(`Failed to open browser for artifact "${title}": ${getErrorMessage(err)}`);
            }
        }
        const llmContent = `Published artifact "${title}" to ${url}. Share or open this URL to view the interactive page. Re-run Artifact with the same file path to update it.`;
        return {
            llmContent,
            returnDisplay: `Published artifact **${title}**\n\n${url}`,
            resultFilePaths: filePath ? [filePath] : undefined,
            artifacts: [
                {
                    kind: 'html',
                    storage: 'published',
                    title,
                    url,
                    managedId,
                    mimeType: 'text/html',
                    sizeBytes: bytes,
                },
            ],
        };
    }
}
/**
 * The Artifact tool: publishes a self-contained HTML fragment as an interactive
 * page and opens it. The backend is pluggable via {@link ArtifactPublisher}
 * (local file://, a custom upload command, or native OSS).
 */
export class ArtifactTool extends BaseDeclarativeTool {
    config;
    openUrl;
    static Name = ToolNames.ARTIFACT;
    publisher;
    constructor(config, publisher, openUrl = openBrowserSecurely) {
        super(ArtifactTool.Name, ToolDisplayNames.ARTIFACT, DESCRIPTION, Kind.Other, {
            type: 'object',
            properties: {
                file_path: {
                    type: 'string',
                    description: 'Absolute path to the body-only HTML fragment file to publish.',
                },
                title: {
                    type: 'string',
                    description: 'Concise title for the artifact (names the browser tab and listing).',
                },
            },
            required: ['file_path'],
        });
        this.config = config;
        this.openUrl = openUrl;
        this.publisher = publisher ?? createArtifactPublisher(config);
    }
    validateToolParamValues(params) {
        const filePath = unescapePath((params.file_path ?? '').trim());
        params.file_path = filePath;
        if (!filePath) {
            return 'Missing or empty "file_path"';
        }
        if (!path.isAbsolute(filePath)) {
            return `File path must be absolute: ${filePath}`;
        }
        return null;
    }
    toAutoClassifierInput(params) {
        return { file_path: params.file_path, title: params.title };
    }
    createInvocation(params) {
        return new ArtifactToolInvocation(this.config, this.publisher, this.openUrl, params);
    }
}
//# sourceMappingURL=artifact-tool.js.map