import { DefaultOpenAICompatibleProvider } from './default.js';
/**
 * Provider for ModelScope API
 */
export class ModelScopeOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    /**
     * Checks if the configuration is for ModelScope.
     */
    static isModelScopeProvider(config) {
        const baseUrl = config.baseUrl ?? '';
        if (!baseUrl)
            return false;
        try {
            const hostname = new URL(baseUrl).hostname.toLowerCase();
            return (hostname === 'modelscope.cn' || hostname.endsWith('.modelscope.cn'));
        }
        catch {
            return false;
        }
    }
    /**
     * ModelScope does not support `stream_options` when `stream` is false.
     * This method removes `stream_options` if `stream` is not true.
     */
    buildRequest(request, userPromptId) {
        const newRequest = super.buildRequest(request, userPromptId);
        if (!newRequest.stream) {
            delete newRequest
                .stream_options;
        }
        return newRequest;
    }
}
//# sourceMappingURL=modelscope.js.map