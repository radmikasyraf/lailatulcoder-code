/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
import { type ServeSessionTasksStatus } from '@lailatul-coder/acp-bridge/status';
export declare function buildSessionTasksStatus(sessionId: string, config: Config, now?: number): ServeSessionTasksStatus;
