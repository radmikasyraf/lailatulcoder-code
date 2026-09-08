/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { HooksConfigSource } from '@lailatul-coder/lailatul-coder-core';
import type { HookConfigDisplayInfo } from './types.js';
export declare function formatSourceLabel(source: HooksConfigSource): string;
export declare function formatSourceLabels(configs: HookConfigDisplayInfo[]): string;
export declare function getConfigSourceDisplay(config: {
    source: HooksConfigSource;
    sourceDisplay: string;
}): string;
