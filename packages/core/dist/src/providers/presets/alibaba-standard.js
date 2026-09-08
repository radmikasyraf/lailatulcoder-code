/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from '../../core/contentGenerator.js';
export const alibabaStandardProvider = {
    id: 'alibabaStandard',
    label: 'Standard API Key',
    description: 'Connect with your LailatulCoder.Ai API key',
    protocol: AuthType.USE_OPENAI,
    baseUrl: 'https://lailatulcoder.llm-ai.gt.tc/v1',
    envKey: 'LAILATULCODER_API_KEY',
    models: [],
    modelsEditable: true,
    fetchModels: true,
    modelNamePrefix: 'LailatulCoder',
    uiGroup: 'alibaba',
    uiLabels: { flowTitle: 'LailatulCoder.Ai Authentication' },
};
//# sourceMappingURL=alibaba-standard.js.map

