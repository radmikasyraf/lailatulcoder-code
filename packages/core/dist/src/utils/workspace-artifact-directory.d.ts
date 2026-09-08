/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const MAX_DIRECTORY_ARTIFACT_FILES = 100;
export declare const MAX_DIRECTORY_ARTIFACT_DEPTH = 4;
export declare const OFFICE_DOCUMENT_EXTENSIONS: ReadonlySet<string>;
export type RecordableWorkspaceWalkResult = {
    files: string[];
    truncated: boolean;
    depthLimited: boolean;
    unreadable: boolean;
    skippedUnrecordable: number;
};
export declare function isOfficeDocumentExtension(ext: string): boolean;
export declare function shouldSkipDirectoryArtifactName(name: string): boolean;
/**
 * Bound-root-canonical paths from a worktree session always start with
 * `.qwen/worktrees/<slug>/`. That leading `.qwen` must not itself trip the
 * skip-directory gate for ordinary subdirectories inside the worktree.
 */
export declare function stripWorktreeArtifactPrefix(workspacePath: string): string;
export declare function pathHasSkippedDirectoryComponent(workspacePath: string): boolean;
export declare function collectRecordableWorkspaceFiles(absoluteDir: string, relativeDir: string, realWorkspace: string, isRecordable?: (relativePath: string) => boolean): Promise<RecordableWorkspaceWalkResult>;
