/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildQwenExtensionFromPlugin, normalizeClaudeMcpServer, resolvePluginRelativeFile, } from './claude-converter.js';
import { realPathWithin } from './gemini-converter.js';
import { EXTENSIONS_CONFIG_FILENAME } from './variables.js';
import { stripAnsiAndControl } from '../utils/textUtils.js';
export const QODER_PLUGIN_MANIFEST = '.qoder-plugin/plugin.json';
function normalizeMcpServers(servers, configPath) {
    return Object.fromEntries(Object.entries(servers).map(([name, server]) => {
        if (typeof server !== 'object' ||
            server === null ||
            Array.isArray(server)) {
            throw new Error(`Invalid Qoder MCP configuration at ${configPath}: server entries must be JSON objects`);
        }
        return [name, normalizeClaudeMcpServer(server)];
    }));
}
function loadQoderConfig(extensionDir) {
    const configPath = path.join(extensionDir, QODER_PLUGIN_MANIFEST);
    if (!fs.existsSync(configPath)) {
        throw new Error(`Qoder plugin configuration not found at ${configPath}`);
    }
    if (!realPathWithin(configPath, extensionDir)) {
        throw new Error(`Qoder plugin configuration at ${configPath} resolves through a symlink outside the plugin`);
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    catch (error) {
        throw new Error(stripAnsiAndControl(`Invalid Qoder plugin configuration at ${configPath}: ${error instanceof Error ? error.message : String(error)}`));
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Invalid Qoder plugin configuration at ${configPath}: expected a JSON object`);
    }
    const config = parsed;
    if (typeof config.name !== 'string' || config.name.length === 0) {
        throw new Error('Qoder plugin config must have name field');
    }
    return {
        ...config,
        version: typeof config.version === 'string' && config.version.length > 0
            ? config.version
            : '1.0.0',
        displayName: typeof config.displayName === 'string' ? config.displayName : undefined,
        description: typeof config.description === 'string' ? config.description : undefined,
    };
}
function loadMcpServersFile(extensionDir, relativePath, requireWrapper) {
    const mcpPath = resolvePluginRelativeFile(extensionDir, relativePath);
    if (!mcpPath || !fs.existsSync(mcpPath)) {
        return undefined;
    }
    const safeMcpPath = stripAnsiAndControl(mcpPath);
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    }
    catch (error) {
        throw new Error(stripAnsiAndControl(`Invalid Qoder MCP configuration at ${safeMcpPath}: ${error instanceof Error ? error.message : String(error)}`));
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Invalid Qoder MCP configuration at ${safeMcpPath}: expected a JSON object`);
    }
    const hasWrapper = Object.prototype.hasOwnProperty.call(parsed, 'mcpServers');
    const servers = hasWrapper
        ? parsed.mcpServers
        : requireWrapper
            ? undefined
            : parsed;
    if (typeof servers !== 'object' ||
        servers === null ||
        Array.isArray(servers)) {
        throw new Error(`Invalid Qoder MCP configuration at ${safeMcpPath}: expected an "mcpServers" object`);
    }
    return normalizeMcpServers(servers, safeMcpPath);
}
function resolveMcpServers(extensionDir, configured) {
    if (typeof configured === 'string') {
        return loadMcpServersFile(extensionDir, configured, false);
    }
    if (configured !== undefined && configured !== null) {
        if (typeof configured !== 'object' || Array.isArray(configured)) {
            throw new Error('Qoder plugin mcpServers must be an object or file path');
        }
        return normalizeMcpServers(configured, path.join(extensionDir, QODER_PLUGIN_MANIFEST));
    }
    return loadMcpServersFile(extensionDir, '.mcp.json', true);
}
function resolveContextFiles(extensionDir, configured) {
    const configuredFiles = configured
        ? Array.isArray(configured)
            ? configured
            : [configured]
        : [];
    const contextFiles = [];
    const seen = new Set();
    const addContextFile = (relativePath, prepend = false) => {
        const resolved = resolvePluginRelativeFile(extensionDir, relativePath);
        if (!resolved)
            return;
        try {
            if (!fs.statSync(resolved).isFile())
                return;
        }
        catch {
            return;
        }
        const normalized = path.relative(path.resolve(extensionDir), resolved);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            if (prepend)
                contextFiles.unshift(normalized);
            else
                contextFiles.push(normalized);
        }
    };
    for (const file of configuredFiles) {
        if (typeof file === 'string')
            addContextFile(file);
    }
    addContextFile('system-prompt.md');
    if (contextFiles.length > 0) {
        addContextFile('QWEN.md', true);
    }
    return contextFiles.length > 0 ? contextFiles : undefined;
}
export async function convertQoderPlugin(extensionDir) {
    const config = loadQoderConfig(extensionDir);
    config.mcpServers = resolveMcpServers(extensionDir, config.mcpServers);
    const converted = await buildQwenExtensionFromPlugin(extensionDir, config);
    const contextFileName = resolveContextFiles(converted.convertedDir, config.contextFileName);
    const qwenConfig = {
        ...converted.config,
        displayName: config.displayName,
        contextFileName,
    };
    try {
        fs.writeFileSync(path.join(converted.convertedDir, EXTENSIONS_CONFIG_FILENAME), JSON.stringify(qwenConfig, null, 2), 'utf-8');
    }
    catch (error) {
        fs.rmSync(converted.convertedDir, { recursive: true, force: true });
        throw error;
    }
    return { ...converted, config: qwenConfig };
}
//# sourceMappingURL=qoder-converter.js.map