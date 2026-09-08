const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

content = content.replace(
  `                const planModels = plan?.models ?? plan?.modelProviders?.[0]?.models ?? plan?.modelProviders ?? [];
                console.error('[AUTO-MODEL] planModels:', JSON.stringify(planModels).slice(0, 200));
                const protocol = inputs.protocol ?? providerConfig.protocol;
                const baseUrl = typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl : providerConfig.baseUrl?.[0]?.url;
                if (planModels.length > 0) {
                    const firstModel = planModels[0];
                    const modelId = firstModel.id ?? firstModel;
                    console.error('[AUTO-MODEL] selecting:', modelId);
                    await config.switchModel?.(protocol, modelId, { baseUrl });
                }`,
  `                // Guna modelSelection.modelId - model yang user pilih masa auth
                const selectedModelId = plan?.modelSelection?.modelId;
                const planModels = plan?.modelProviders?.[0]?.models ?? [];
                const modelId = selectedModelId ?? planModels[0]?.id;
                const protocol = inputs.protocol ?? providerConfig.protocol;
                const baseUrl = typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl : providerConfig.baseUrl?.[0]?.url ?? planModels[0]?.baseUrl;
                console.error('[AUTO-MODEL] selecting:', modelId, 'from modelSelection:', selectedModelId);
                if (modelId) {
                    await config.switchModel?.(protocol, modelId, { baseUrl });
                }`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
console.log('Done! Now uses plan.modelSelection.modelId');
