/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from '../../core/contentGenerator.js';
export const REQUESTY_ENV_KEY = 'REQUESTY_API_KEY';
export const REQUESTY_BASE_URL = 'https://router.requesty.ai/v1';
export const requestyProvider = {
    id: 'requesty',
    label: 'Requesty',
    description: 'Connect with a Requesty API key (get one from app.requesty.ai/api-keys)',
    protocol: AuthType.USE_OPENAI,
    baseUrl: REQUESTY_BASE_URL,
    envKey: REQUESTY_ENV_KEY,
    models: [
        { id: 'openai/gpt-4o-mini', contextWindowSize: 128000 },
        { id: 'openai/gpt-4o', contextWindowSize: 128000 },
    ],
    modelsEditable: true,
    modelNamePrefix: 'Requesty',
    ownsModel: (model) => {
        if (model.envKey !== REQUESTY_ENV_KEY)
            return false;
        try {
            const host = new URL(model.baseUrl ?? '').hostname;
            return host === 'router.requesty.ai' || host.endsWith('.requesty.ai');
        }
        catch {
            return false;
        }
    },
    customHeaders: {
        'HTTP-Referer': 'https://github.com/LailatulCoder/lailatul-coder.git',
        'X-Title': 'LailatulCoder Ai',
    },
    documentationUrl: 'https://docs.requesty.ai',
    uiGroup: 'third-party',
};
//# sourceMappingURL=requesty.js.map