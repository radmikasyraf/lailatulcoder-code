/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, DebugLogger } from '@lailatul-coder/lailatul-coder-core';

export function fireSessionDeleteHook(
  config: Config,
  sessionId: string,
  logger: DebugLogger = config.getDebugLogger(),
): void {
  void config
    .getHookSystem()
    ?.fireSessionDeleteEvent(sessionId)
    .catch((error) => {
      logger.warn(
        `SessionDelete hook failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}
