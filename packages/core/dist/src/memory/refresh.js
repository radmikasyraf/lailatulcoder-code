/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'node:path';
import { ToolNames, canonicalToolName } from '../tools/tool-names.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { getAllGeminiMdFilenames } from './const.js';
import { isAllowedMemoryPath } from './memory-scoped-agent-config.js';
import { rebuildManagedAutoMemoryIndex, rebuildUserAutoMemoryIndex, } from './indexer.js';
const debugLogger = createDebugLogger('AUTO_MEMORY_REFRESH');
const WRITE_TOOL_NAMES = new Set([
    ToolNames.WRITE_FILE,
    ToolNames.EDIT,
]);
function candidateFilePath(args) {
    const value = args?.['file_path'] ?? args?.['path'] ?? args?.['target_file'];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function resolveCandidatePath(filePath, projectRoot) {
    return path.resolve(projectRoot, filePath);
}
function isSuccessfulWrite(candidate) {
    if (candidate.status !== undefined && candidate.status !== 'success') {
        return false;
    }
    return WRITE_TOOL_NAMES.has(canonicalToolName(candidate.toolName));
}
function logPrefix(options) {
    return options?.logContext ? `${options.logContext}: ` : '';
}
function classifyWrittenMemoryScope(candidate, projectRoot) {
    if (!isSuccessfulWrite(candidate)) {
        return undefined;
    }
    const filePath = candidateFilePath(candidate.args);
    if (!filePath) {
        return undefined;
    }
    const resolved = resolveCandidatePath(filePath, projectRoot);
    if (!isAllowedMemoryPath(resolved, projectRoot)) {
        return undefined;
    }
    return isAllowedMemoryPath(resolved, projectRoot, {
        includeUserMemory: false,
    })
        ? 'project'
        : 'user';
}
export function didWriteManagedMemory(candidates, projectRoot) {
    return candidates.some((candidate) => classifyWrittenMemoryScope(candidate, projectRoot) !== undefined);
}
export function didWriteProjectContextFile(candidates, projectRoot) {
    const contextFilePaths = new Set(getAllGeminiMdFilenames()
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .map((name) => path.resolve(projectRoot, name)));
    return candidates.some((candidate) => {
        if (!isSuccessfulWrite(candidate)) {
            return false;
        }
        const filePath = candidateFilePath(candidate.args);
        return (filePath !== undefined &&
            contextFilePaths.has(resolveCandidatePath(filePath, projectRoot)));
    });
}
async function rebuildWrittenMemoryIndexes(candidates, projectRoot, options) {
    let wroteProjectMemory = false;
    let wroteUserMemory = false;
    for (const candidate of candidates) {
        const scope = classifyWrittenMemoryScope(candidate, projectRoot);
        wroteProjectMemory ||= scope === 'project';
        wroteUserMemory ||= scope === 'user';
    }
    await Promise.all([
        wroteProjectMemory
            ? rebuildManagedAutoMemoryIndex(projectRoot).catch((err) => {
                debugLogger.warn(`${logPrefix(options)}rebuildManagedAutoMemoryIndex failed: ${err}`);
            })
            : Promise.resolve(),
        wroteUserMemory
            ? rebuildUserAutoMemoryIndex().catch((err) => {
                debugLogger.warn(`${logPrefix(options)}rebuildUserAutoMemoryIndex failed: ${err}`);
            })
            : Promise.resolve(),
    ]);
}
export async function refreshMemoryInstruction(config, options) {
    try {
        await config.refreshHierarchicalMemory();
    }
    catch (err) {
        debugLogger.warn(`${logPrefix(options)}refreshHierarchicalMemory failed: ${err}`);
    }
    try {
        await config.getGeminiClient()?.refreshSystemInstruction();
    }
    catch (err) {
        debugLogger.warn(`${logPrefix(options)}refreshSystemInstruction failed: ${err}`);
    }
}
export async function refreshMemoryAfterManagedWrite(config, candidates, options = {}) {
    try {
        if (typeof config.isManagedMemoryAvailable !== 'function') {
            return false;
        }
        if (!config.isManagedMemoryAvailable()) {
            return false;
        }
        const projectRoot = config.getProjectRoot();
        if (!didWriteManagedMemory(candidates, projectRoot)) {
            return false;
        }
        await rebuildWrittenMemoryIndexes(candidates, projectRoot, options);
        await refreshMemoryInstruction(config, options);
        return true;
    }
    catch (err) {
        debugLogger.warn(`${logPrefix(options)}refreshMemoryAfterManagedWrite failed: ${err}`);
        return false;
    }
}
//# sourceMappingURL=refresh.js.map