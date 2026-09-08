/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from 'node:crypto';
function sortJsonValue(value) {
    if (Array.isArray(value)) {
        return value.map(sortJsonValue);
    }
    if (value && typeof value === 'object') {
        // Object.create(null) avoids prototype pollution from __proto__ keys
        const sorted = Object.create(null);
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortJsonValue(value[key]);
        }
        return sorted;
    }
    return value;
}
export function lspServerConfigHash(config) {
    const hashInput = {
        name: config.name,
        languages: config.languages,
        transport: config.transport,
        command: config.command,
        args: config.args,
        env: config.env,
        initializationOptions: config.initializationOptions,
        settings: config.settings,
        extensionToLanguage: config.extensionToLanguage,
        workspaceFolder: config.workspaceFolder,
        rootUri: config.rootUri,
        startupTimeout: config.startupTimeout,
        shutdownTimeout: config.shutdownTimeout,
        restartOnCrash: config.restartOnCrash,
        maxRestarts: config.maxRestarts,
        trustRequired: config.trustRequired,
        socket: config.socket,
    };
    const stableConfig = sortJsonValue(hashInput);
    return createHash('sha256')
        .update(JSON.stringify(stableConfig))
        .digest('hex');
}
//# sourceMappingURL=configHash.js.map