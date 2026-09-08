/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { HookEventName } from './types.js';
/**
 * Create the informational InstructionsLoaded callback used by memory loaders.
 * The hook result is intentionally ignored: this event reports loaded
 * instruction files and does not gate memory discovery.
 */
export function createInstructionsLoadedCallback(getHookSystem) {
    return async (notification) => {
        const hookSystem = getHookSystem();
        if (!hookSystem?.hasHooksForEvent(HookEventName.InstructionsLoaded)) {
            return;
        }
        await hookSystem.fireInstructionsLoadedEvent(notification.filePath, notification.memoryType, notification.loadReason, {
            triggerFilePath: notification.triggerFilePath,
            parentFilePath: notification.parentFilePath,
        });
    };
}
//# sourceMappingURL=instructionsLoadedCallback.js.map