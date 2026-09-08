/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
export function fireSessionDeleteHook(config, sessionId, logger = config.getDebugLogger()) {
    void config
        .getHookSystem()
        ?.fireSessionDeleteEvent(sessionId)
        .catch((error) => {
        logger.warn(`SessionDelete hook failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    });
}
//# sourceMappingURL=session-delete-hook.js.map