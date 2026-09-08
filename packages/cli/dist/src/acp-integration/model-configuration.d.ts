/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ReasoningEffort } from '@lailatul-coder/lailatul-coder-core';
export type ModelReasoningConfiguration = {
    readonly thinking: true;
    readonly toggleOnly: true;
} | {
    readonly thinking: true;
    readonly toggleOnly?: false;
    readonly efforts: readonly ReasoningEffort[];
    readonly defaultEffort: ReasoningEffort;
};
export declare function getModelConfiguration(modelId: string | undefined): {
    readonly reasoning?: ModelReasoningConfiguration;
} | undefined;
