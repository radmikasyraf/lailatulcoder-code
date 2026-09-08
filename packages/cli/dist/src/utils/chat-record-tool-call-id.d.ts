/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatRecord } from '@lailatul-coder/lailatul-coder-core';
export declare function getToolResultCallId(record: ChatRecord): string;
export declare function getExplicitToolResultCallId(record: ChatRecord): string | undefined;
