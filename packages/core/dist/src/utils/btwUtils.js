/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import { createDebugLogger } from './debugLogger.js';
const logger = createDebugLogger('btw');
/** Maximum input length (chars) accepted by btw routes and slash command. */
export const BTW_MAX_INPUT_LENGTH = 4096;
export function buildBtwPrompt(question) {
    return [
        '<system-reminder>',
        'This is a side question from the user. Answer directly in a single response.',
        '',
        'CRITICAL CONSTRAINTS:',
        '- You have NO tools available — you cannot read files, run commands, or take any actions.',
        '- You can ONLY use information already present in the conversation context.',
        '- NEVER promise to look something up or investigate further.',
        '- If you do not know the answer, say so.',
        '- The main conversation is NOT interrupted; you are a separate, lightweight fork.',
        '</system-reminder>',
        '',
        question,
    ].join('\n');
}
export function buildBtwCacheSafeParams(config) {
    const geminiClient = config.getGeminiClient();
    try {
        const chat = geminiClient.getChat();
        const generationConfig = chat.getGenerationConfig();
        if (!generationConfig)
            return null;
        const maxHistoryEntries = 40;
        const history = geminiClient.getHistoryTail(maxHistoryEntries, true);
        return {
            generationConfig: structuredClone(generationConfig),
            history,
            model: config.getModel() ?? '',
            version: 0,
        };
    }
    catch (err) {
        logger.debug(`buildBtwCacheSafeParams failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
//# sourceMappingURL=btwUtils.js.map