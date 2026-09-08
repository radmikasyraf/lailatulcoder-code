/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { SessionService, Storage, } from '@lailatul-coder/lailatul-coder-core';
export function runWithWorkspaceRuntimeStorage(runtime, fn) {
    return Storage.runWithResolvedRuntimeBaseDir(runtime.sessionRuntimeBaseDir, fn);
}
export function createWorkspaceRuntimeSessionService(runtime, options = {}) {
    return new SessionService(runtime.workspaceCwd, {
        ...options,
        runtimeBaseDir: runtime.sessionRuntimeBaseDir,
    });
}
//# sourceMappingURL=workspace-runtime-storage.js.map