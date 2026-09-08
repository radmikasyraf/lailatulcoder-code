/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as os from 'node:os';
import * as path from 'node:path';
// Keep this literal in sync with core's QWEN_DIR. This lite module must not
// import @lailatul-coder/lailatul-coder-core because it runs before serve listener ready.
export const SETTINGS_DIRECTORY_NAME = '.lailatulcoder';
export function resolveConfigPathLite(dir, cwd) {
    let resolved = dir;
    if (resolved === '~' ||
        resolved.startsWith('~/') ||
        resolved.startsWith('~\\')) {
        const relativeSegments = resolved === '~'
            ? []
            : resolved
                .slice(2)
                .split(/[/\\]+/)
                .filter(Boolean);
        resolved = path.join(os.homedir(), ...relativeSegments);
    }
    if (!path.isAbsolute(resolved)) {
        resolved = path.resolve(cwd || process.cwd(), resolved);
    }
    return resolved;
}
export function getGlobalQwenDirLite() {
    const envDir = process.env['QWEN_HOME'];
    if (envDir) {
        return resolveConfigPathLite(envDir);
    }
    const homeDir = os.homedir();
    if (!homeDir) {
        return path.join(os.tmpdir(), SETTINGS_DIRECTORY_NAME);
    }
    return path.join(homeDir, SETTINGS_DIRECTORY_NAME);
}
export function getSystemSettingsPath() {
    if (process.env['QWEN_CODE_SYSTEM_SETTINGS_PATH']) {
        return process.env['QWEN_CODE_SYSTEM_SETTINGS_PATH'];
    }
    if (os.platform() === 'darwin') {
        return '/Library/Application Support/QwenCode/settings.json';
    }
    if (os.platform() === 'win32') {
        return 'C:\\ProgramData\\lailatul-coder\\settings.json';
    }
    return '/etc/lailatul-coder/settings.json';
}
export function getSystemDefaultsPath() {
    if (process.env['QWEN_CODE_SYSTEM_DEFAULTS_PATH']) {
        return process.env['QWEN_CODE_SYSTEM_DEFAULTS_PATH'];
    }
    return path.join(path.dirname(getSystemSettingsPath()), 'system-defaults.json');
}
//# sourceMappingURL=storage-paths-lite.js.map