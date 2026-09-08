/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { getAllGeminiMdFilenames, LOCAL_CONTEXT_FILENAME, } from '../memory/const.js';
import { processImports } from './memoryImportProcessor.js';
import { isSubpath, QWEN_DIR, tildeifyPath } from './paths.js';
import { stripAnsiAndControl } from './textUtils.js';
import { Storage } from '../config/storage.js';
import { createDebugLogger } from './debugLogger.js';
import { findProjectRoot } from './projectRoot.js';
import { loadRules } from './rulesDiscovery.js';
const logger = createDebugLogger('MEMORY_DISCOVERY');
async function getGeminiMdFilePathsInternal(currentWorkingDirectory, includeDirectoriesToReadGemini, userHomePath, fileService, extensionContextFilePaths = [], folderTrust, implicitDiscoveryEnabled = true) {
    const dirs = new Set(implicitDiscoveryEnabled
        ? [...includeDirectoriesToReadGemini, currentWorkingDirectory]
        : [...includeDirectoriesToReadGemini]);
    // Process directories in parallel with concurrency limit to prevent EMFILE errors
    const CONCURRENT_LIMIT = 10;
    const dirsArray = Array.from(dirs);
    const pathsArrays = [];
    for (let i = 0; i < dirsArray.length; i += CONCURRENT_LIMIT) {
        const batch = dirsArray.slice(i, i + CONCURRENT_LIMIT);
        const batchPromises = batch.map((dir) => getGeminiMdFilePathsInternalForEachDir(dir, userHomePath, fileService, extensionContextFilePaths, folderTrust, implicitDiscoveryEnabled));
        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                pathsArrays.push(result.value);
            }
            else {
                const error = result.reason;
                const message = error instanceof Error ? error.message : String(error);
                logger.error(`Error discovering files in directory: ${message}`);
                // Continue processing other directories
            }
        }
    }
    const paths = pathsArrays.flat();
    return Array.from(new Set(paths));
}
async function getGeminiMdFilePathsInternalForEachDir(dir, userHomePath, fileService, extensionContextFilePaths = [], folderTrust, implicitDiscoveryEnabled = true) {
    const allPaths = new Set();
    const geminiMdFilenames = getAllGeminiMdFilenames();
    for (const geminiMdFilename of geminiMdFilenames) {
        const resolvedHome = path.resolve(userHomePath);
        const globalQwenDir = Storage.getGlobalQwenDir();
        const globalMemoryPath = path.join(globalQwenDir, geminiMdFilename);
        // Handle the case where we're in the home directory (dir is empty string or home path)
        const resolvedDir = dir ? path.resolve(dir) : resolvedHome;
        const isHomeDirectory = resolvedDir === resolvedHome;
        if (!implicitDiscoveryEnabled) {
            const explicitContextPath = path.join(resolvedDir, geminiMdFilename);
            try {
                await fs.access(explicitContextPath, fsSync.constants.R_OK);
                allPaths.add(explicitContextPath);
                logger.debug(`Found readable explicit ${geminiMdFilename}: ${explicitContextPath}`);
            }
            catch {
                // Not found, which is okay for explicit-only discovery.
            }
        }
        else {
            // This part that finds the global file always runs.
            try {
                await fs.access(globalMemoryPath, fsSync.constants.R_OK);
                allPaths.add(globalMemoryPath);
                logger.debug(`Found readable global ${geminiMdFilename}: ${globalMemoryPath}`);
            }
            catch {
                // It's okay if it's not found.
            }
        }
        if (!implicitDiscoveryEnabled) {
            continue;
        }
        if (isHomeDirectory) {
            // For home directory, only check for QWEN.md directly in the home directory
            const homeContextPath = path.join(resolvedHome, geminiMdFilename);
            try {
                await fs.access(homeContextPath, fsSync.constants.R_OK);
                if (homeContextPath !== globalMemoryPath) {
                    allPaths.add(homeContextPath);
                    logger.debug(`Found readable home ${geminiMdFilename}: ${homeContextPath}`);
                }
            }
            catch {
                // Not found, which is okay
            }
        }
        else if (dir && folderTrust) {
            // FIX: Only perform the workspace search (upward scan from CWD to project root)
            // if a valid currentWorkingDirectory is provided and it's not the home directory.
            const resolvedCwd = path.resolve(dir);
            logger.debug(`Searching for ${geminiMdFilename} starting from CWD: ${resolvedCwd}`);
            const projectRoot = await findProjectRoot(resolvedCwd);
            logger.debug(`Determined project root: ${projectRoot ?? 'None'}`);
            const upwardPaths = [];
            let currentDir = resolvedCwd;
            const ultimateStopDir = projectRoot
                ? path.dirname(projectRoot)
                : path.dirname(resolvedHome);
            while (currentDir && currentDir !== path.dirname(currentDir)) {
                if (currentDir === globalQwenDir ||
                    currentDir === path.join(resolvedHome, QWEN_DIR)) {
                    break;
                }
                const potentialPath = path.join(currentDir, geminiMdFilename);
                try {
                    await fs.access(potentialPath, fsSync.constants.R_OK);
                    if (potentialPath !== globalMemoryPath) {
                        upwardPaths.unshift(potentialPath);
                    }
                }
                catch {
                    // Not found, continue.
                }
                if (currentDir === ultimateStopDir) {
                    break;
                }
                currentDir = path.dirname(currentDir);
            }
            upwardPaths.forEach((p) => allPaths.add(p));
        }
    }
    // Add extension context file paths.
    for (const extensionPath of extensionContextFilePaths) {
        allPaths.add(extensionPath);
    }
    const finalPaths = Array.from(allPaths);
    logger.debug(`Final ordered ${getAllGeminiMdFilenames()} paths to read: ${JSON.stringify(finalPaths)}`);
    return finalPaths;
}
async function readGeminiMdFiles(filePaths, importFormat = 'tree', getMemoryType, onInstructionsLoaded, loadReason = 'session_start') {
    // Process files in parallel with concurrency limit to prevent EMFILE errors
    const CONCURRENT_LIMIT = 20; // Higher limit for file reads as they're typically faster
    const results = [];
    const notifyInstructionsLoaded = async (notification) => {
        try {
            await onInstructionsLoaded?.(notification);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`InstructionsLoaded notification failed for ${notification.filePath}: ${message}`);
        }
    };
    for (let i = 0; i < filePaths.length; i += CONCURRENT_LIMIT) {
        const batch = filePaths.slice(i, i + CONCURRENT_LIMIT);
        const batchPromises = batch.map(async (filePath) => {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                // Process imports in the content
                const processedResult = await processImports(content, path.dirname(filePath), {
                    processedFiles: new Set([path.resolve(filePath)]),
                    maxDepth: 5,
                    currentDepth: 0,
                    currentFile: path.resolve(filePath),
                }, undefined, importFormat, {
                    onFileImported: async (notification) => {
                        const parentFilePath = notification.parentFilePath;
                        await notifyInstructionsLoaded({
                            filePath: notification.filePath,
                            // Included files inherit the root instruction file's memory type.
                            memoryType: getMemoryType(filePath),
                            loadReason: 'include',
                            triggerFilePath: filePath,
                            parentFilePath,
                        });
                    },
                });
                await notifyInstructionsLoaded({
                    filePath,
                    memoryType: getMemoryType(filePath),
                    loadReason,
                });
                logger.debug(`Successfully read and processed imports: ${filePath} (Length: ${processedResult.content.length})`);
                return { filePath, content: processedResult.content };
            }
            catch (error) {
                const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['VITEST'];
                if (!isTestEnv) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.warn(`Warning: Could not read ${getAllGeminiMdFilenames()} file at ${filePath}. Error: ${message}`);
                }
                logger.debug(`Failed to read: ${filePath}`);
                return { filePath, content: null }; // Still include it with null content
            }
        });
        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
            else {
                // This case shouldn't happen since we catch all errors above,
                // but handle it for completeness
                const error = result.reason;
                const message = error instanceof Error ? error.message : String(error);
                logger.error(`Unexpected error processing file: ${message}`);
            }
        }
    }
    return results;
}
/**
 * Renders a context file path for display: relative to the CWD when the
 * file is inside the CWD tree, otherwise a `~/...` shortcut when the file
 * lives under the user home (instead of a long `../../..` chain). Output
 * is sanitized because directory names are attacker-influenceable.
 */
export function formatContextFileDisplayPath(filePath, currentWorkingDirectory, 
// Same home the loader used for discovery, so display and discovery agree.
userHomePath = homedir()) {
    if (!path.isAbsolute(filePath)) {
        return stripAnsiAndControl(filePath);
    }
    const relativePath = path.relative(currentWorkingDirectory, filePath);
    // isSubpath rejects real `..` segments (not mere `..`-prefixed names like
    // `..cfg`) and absolute relatives, which is what Windows cross-drive
    // targets produce. That arm is consciously untested: POSIX `path.relative`
    // never returns an absolute path and the fixtures share one volume.
    if (!isSubpath(currentWorkingDirectory, filePath)) {
        const tildeified = tildeifyPath(filePath, userHomePath);
        if (tildeified !== filePath) {
            return stripAnsiAndControl(tildeified);
        }
    }
    return stripAnsiAndControl(relativePath);
}
// The attachment rule for the system prompt: only non-blank string content
// reaches it. Shared by concatenateInstructions and contextFilePaths so the
// "displayed = attached" property holds by construction.
function hasAttachedContent(item) {
    return typeof item.content === 'string' && item.content.trim().length > 0;
}
function concatenateInstructions(instructionContents, 
// CWD is needed to resolve relative paths for display markers
currentWorkingDirectoryForDisplay) {
    return instructionContents
        .filter(hasAttachedContent)
        .map((item) => {
        const trimmedContent = item.content.trim();
        // Sanitize the marker path: paths under attacker-influenceable
        // directory names could otherwise forge or hide entries in the
        // `/context` parser (newline/control chars break its line-oriented
        // markers), contradicting the sanitized announcement surface.
        const displayPath = stripAnsiAndControl(path.isAbsolute(item.filePath)
            ? path.relative(currentWorkingDirectoryForDisplay, item.filePath)
            : item.filePath);
        return `--- Context from: ${displayPath} ---\n${trimmedContent}\n--- End of Context from: ${displayPath} ---`;
    })
        .join('\n\n');
}
function createMemoryTypeClassifier(userHomePath, foundRoot, extensionContextFilePaths) {
    const resolvedHome = path.resolve(userHomePath);
    const globalQwenDir = path.resolve(Storage.getGlobalQwenDir());
    const resolvedRoot = foundRoot ? path.resolve(foundRoot) : undefined;
    const extensionPaths = new Set(extensionContextFilePaths.map((filePath) => path.resolve(filePath)));
    const extensionRoots = extensionContextFilePaths.map((filePath) => path.dirname(path.resolve(filePath)));
    return (filePath) => {
        const resolvedPath = path.resolve(filePath);
        if (extensionPaths.has(resolvedPath) ||
            extensionRoots.some((root) => isSubpath(root, resolvedPath))) {
            return 'extension';
        }
        if (resolvedPath.startsWith(`${globalQwenDir}${path.sep}`)) {
            return 'user';
        }
        if (resolvedRoot &&
            resolvedPath === path.join(resolvedRoot, QWEN_DIR, LOCAL_CONTEXT_FILENAME)) {
            return 'local';
        }
        if (resolvedRoot && isSubpath(resolvedRoot, resolvedPath)) {
            return 'project';
        }
        if (path.dirname(resolvedPath) === resolvedHome) {
            return 'user';
        }
        return 'project';
    };
}
/**
 * Loads hierarchical QWEN.md files and concatenates their content.
 * Also loads path-based context rules from `.lailatulcoder/rules/` directories.
 * This function is intended for use by the server.
 *
 * @param contextRuleExcludes - Glob patterns to skip when loading rules.
 */
export async function loadServerHierarchicalMemory(currentWorkingDirectory, includeDirectoriesToReadGemini, fileService, extensionContextFilePaths = [], folderTrust, importFormat = 'tree', contextRuleExcludes = [], options = {}) {
    logger.debug(`Loading server hierarchical memory for CWD: ${currentWorkingDirectory} (importFormat: ${importFormat})`);
    const implicitDiscoveryEnabled = !options.explicitOnly;
    // For the server, homedir() refers to the server process's home.
    // This is consistent with how MemoryTool already finds the global path.
    const userHomePath = homedir();
    const filePaths = await getGeminiMdFilePathsInternal(currentWorkingDirectory, includeDirectoriesToReadGemini, userHomePath, fileService, extensionContextFilePaths, folderTrust, implicitDiscoveryEnabled);
    // Resolve project root once — needed both for the QWEN.local.md slot
    // (below) and for rules discovery (further down).
    const resolvedCwd = path.resolve(currentWorkingDirectory);
    const foundRoot = await findProjectRoot(resolvedCwd);
    const effectiveRoot = foundRoot ?? resolvedCwd;
    // Append the per-developer local context file slot:
    // `<projectRoot>/.lailatulcoder/QWEN.local.md`. Loaded after all hierarchical
    // QWEN.md / AGENTS.md files so local instructions can supplement or
    // override shared ones. Same trust + explicit-only gating as the rest
    // of the project-level discovery.
    //
    // Requires a real project root (`foundRoot`, not the `resolvedCwd`
    // fallback). Without that gate, two failure modes appear:
    //   * Deep cwd in a non-git workspace turns the slot into a per-cwd
    //     file, breaking the "single fixed slot" invariant.
    //   * `cwd === homedir` resolves the slot path to `~/.lailatulcoder/QWEN.local.md`,
    //     colliding with the global Qwen directory.
    if (implicitDiscoveryEnabled && folderTrust && foundRoot) {
        const localContextPath = path.join(foundRoot, QWEN_DIR, LOCAL_CONTEXT_FILENAME);
        try {
            await fs.access(localContextPath, fsSync.constants.R_OK);
            if (!filePaths.includes(localContextPath)) {
                filePaths.push(localContextPath);
                logger.debug(`Found readable local ${LOCAL_CONTEXT_FILENAME}: ${localContextPath}`);
            }
        }
        catch {
            // Not found, which is the common case — silently skip.
        }
    }
    let combinedInstructions = '';
    let fileCount = 0;
    let contextFilePaths = [];
    if (filePaths.length > 0) {
        const loadReason = options.loadReason ?? 'session_start';
        const contentsWithPaths = await readGeminiMdFiles(filePaths, importFormat, createMemoryTypeClassifier(userHomePath, foundRoot, extensionContextFilePaths), options.onInstructionsLoaded, loadReason);
        // Pass CWD for relative path display in concatenated content
        combinedInstructions = concatenateInstructions(contentsWithPaths, currentWorkingDirectory);
        // Only count files that match configured memory filenames (e.g., QWEN.md),
        // excluding system context files like output-language.md. Note: this is
        // intentionally different from contextFilePaths below, which is
        // content-based and includes non-memory-named files. The two surfaces
        // (/memory count vs announcement list) may differ; aligning them at
        // the display site is deferred as a follow-up.
        const memoryFilenames = new Set([
            ...getAllGeminiMdFilenames(),
            LOCAL_CONTEXT_FILENAME,
        ]);
        const memoryItems = contentsWithPaths.filter((item) => memoryFilenames.has(path.basename(item.filePath)));
        fileCount = memoryItems.length;
        // Announce every top-level file whose content actually reached the
        // system prompt (see hasAttachedContent) — not just memory-named files —
        // so the list matches what concatenateInstructions attached. Files
        // pulled in via @import are inlined into their importer's content and
        // are not listed separately.
        contextFilePaths = contentsWithPaths
            .filter(hasAttachedContent)
            .map((item) => formatContextFileDisplayPath(item.filePath, currentWorkingDirectory, userHomePath));
    }
    // Load path-based context rules from .lailatulcoder/rules/ directories.
    const { content: rulesContent, ruleCount, conditionalRules, } = options.explicitOnly
        ? { content: '', ruleCount: 0, conditionalRules: [] }
        : await loadRules(effectiveRoot, folderTrust, contextRuleExcludes);
    // Baseline rules go into the system prompt
    let memoryContent = combinedInstructions;
    if (rulesContent) {
        memoryContent = memoryContent
            ? `${memoryContent}\n\n${rulesContent}`
            : rulesContent;
    }
    if (!memoryContent && filePaths.length === 0 && ruleCount === 0) {
        logger.debug('No QWEN.md files or rules found.');
    }
    return {
        memoryContent,
        fileCount,
        contextFilePaths,
        ruleCount,
        conditionalRules,
        projectRoot: effectiveRoot,
    };
}
//# sourceMappingURL=memoryDiscovery.js.map