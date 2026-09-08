/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
const MODEL_CONFIGURATIONS = {
    'qwen3.5-plus': {
        reasoning: { thinking: true, toggleOnly: true },
    },
    'qwen3.6-plus': {
        reasoning: { thinking: true, toggleOnly: true },
    },
    'qwen3.6-flash': {
        reasoning: { thinking: true, toggleOnly: true },
    },
    'qwen3.7-plus': {
        reasoning: { thinking: true, toggleOnly: true },
    },
    'qwen3.7-max': {
        reasoning: { thinking: true, toggleOnly: true },
    },
    'qwen3.8-max': {
        reasoning: {
            thinking: true,
            efforts: ['low', 'medium', 'xhigh'],
            defaultEffort: 'xhigh',
        },
    },
};
export function getModelConfiguration(modelId) {
    return modelId ? MODEL_CONFIGURATIONS[modelId] : undefined;
}
//# sourceMappingURL=model-configuration.js.map