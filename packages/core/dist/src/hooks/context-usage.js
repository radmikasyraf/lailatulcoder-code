export function buildContextUsage(contextWindowSize, inputTokens) {
    if (!contextWindowSize ||
        !Number.isFinite(contextWindowSize) ||
        contextWindowSize <= 0 ||
        !Number.isFinite(inputTokens) ||
        inputTokens <= 0) {
        return undefined;
    }
    return {
        context_usage: inputTokens / contextWindowSize,
        context_limit: contextWindowSize,
        input_tokens: inputTokens,
    };
}
//# sourceMappingURL=context-usage.js.map