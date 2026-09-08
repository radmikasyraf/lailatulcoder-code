/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';
import { formatQwenIgnoreFileNames, QwenIgnoreParser, } from '../utils/qwenIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'node:path';
export class FileDiscoveryService {
    customIgnoreFiles;
    gitIgnoreFilter = null;
    qwenIgnoreFilter = null;
    projectRoot;
    constructor(projectRoot, customIgnoreFiles) {
        this.customIgnoreFiles = customIgnoreFiles;
        this.projectRoot = path.resolve(projectRoot);
        if (isGitRepository(this.projectRoot)) {
            this.gitIgnoreFilter = new GitIgnoreParser(this.projectRoot);
        }
        this.lailatulcoderIgnoreFilter = new QwenIgnoreParser(this.projectRoot, customIgnoreFiles);
    }
    /**
     * Filters a list of file paths based on git and AI ignore rules.
     */
    filterFiles(filePaths, options = {
        respectGitIgnore: true,
        respectQwenIgnore: true,
    }) {
        return filePaths.filter((filePath) => {
            if (options.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
                return false;
            }
            if (options.respectQwenIgnore && this.shouldQwenIgnoreFile(filePath)) {
                return false;
            }
            return true;
        });
    }
    /**
     * Filters a list of file paths based on git ignore rules and returns a report
     * with counts of ignored files.
     */
    filterFilesWithReport(filePaths, opts = {
        respectGitIgnore: true,
        respectQwenIgnore: true,
    }) {
        const filteredPaths = [];
        let gitIgnoredCount = 0;
        let qwenIgnoredCount = 0;
        for (const filePath of filePaths) {
            if (opts.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
                gitIgnoredCount++;
                continue;
            }
            if (opts.respectQwenIgnore && this.shouldQwenIgnoreFile(filePath)) {
                qwenIgnoredCount++;
                continue;
            }
            filteredPaths.push(filePath);
        }
        return {
            filteredPaths,
            gitIgnoredCount,
            qwenIgnoredCount,
        };
    }
    /**
     * Checks if a single file should be git-ignored
     */
    shouldGitIgnoreFile(filePath) {
        if (this.gitIgnoreFilter) {
            return this.gitIgnoreFilter.isIgnored(filePath);
        }
        return false;
    }
    /**
     * Checks if a single file should be ignored by Qwen/agent ignore files.
     */
    shouldQwenIgnoreFile(filePath) {
        if (this.lailatulcoderIgnoreFilter) {
            return this.lailatulcoderIgnoreFilter.isIgnored(filePath);
        }
        return false;
    }
    /**
     * Unified method to check if a file should be ignored based on filtering options.
     *
     * Convention: append a trailing `/` to `filePath` to signal that the path
     * refers to a directory. This allows directory-only ignore patterns (e.g.
     * `node_modules/`) to match correctly during traversal pruning. Both the
     * GitIgnoreParser and QwenIgnoreParser preserve the trailing slash through
     * their internal path normalization.
     */
    shouldIgnoreFile(filePath, options = {}) {
        const { respectGitIgnore = true, respectQwenIgnore: respectQwenIgnore = true, } = options;
        if (respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
            return true;
        }
        if (respectQwenIgnore && this.shouldQwenIgnoreFile(filePath)) {
            return true;
        }
        return false;
    }
    /**
     * Returns loaded patterns from Qwen/agent ignore files.
     */
    getQwenIgnorePatterns() {
        return this.lailatulcoderIgnoreFilter?.getPatterns() ?? [];
    }
    getQwenIgnoreFileDisplayForPath(filePath) {
        return (this.lailatulcoderIgnoreFilter?.getIgnoreFileNameForPath(filePath) ??
            this.getQwenIgnoreFileNamesDisplay());
    }
    getQwenIgnoreFileNamesDisplay() {
        return formatQwenIgnoreFileNames(this.customIgnoreFiles);
    }
}
//# sourceMappingURL=fileDiscoveryService.js.map