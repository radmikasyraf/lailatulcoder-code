/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'node:path';
import { ensureAgentViewSupervisor } from './supervisor-runner.js';
export async function detachCurrentSessionToAgentView(config, options = {}) {
    const sessionId = config.getSessionId();
    const projectCwd = path.resolve(config.getProjectRoot());
    const activeCwd = path.resolve(config.getTargetDir());
    const supervisor = await (options.ensureSupervisor ?? ensureAgentViewSupervisor)(storeOptions(options));
    await supervisor.adopt({
        sessionId,
        projectCwd,
        activeCwd,
        approvalMode: stringifyOptional(config.getApprovalMode()),
        sandbox: stringifySandbox(config.getSandbox()),
        terminal: {
            columns: options.terminal?.columns ?? process.stdout.columns ?? 80,
            rows: options.terminal?.rows ?? process.stdout.rows ?? 24,
        },
    });
    return { sessionId };
}
function stringifyOptional(value) {
    return value === undefined || value === null ? undefined : String(value);
}
function stringifySandbox(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value === 'string')
        return value;
    if (typeof value === 'boolean')
        return String(value);
    return JSON.stringify(value);
}
function storeOptions(options) {
    return options.globalDir ? { globalDir: options.globalDir } : {};
}
//# sourceMappingURL=managed-detach.js.map