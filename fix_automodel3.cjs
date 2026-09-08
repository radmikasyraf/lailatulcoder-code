const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

const oldText = `            completeAuthentication();
            const feedbackItem = {`;

const newText = `            completeAuthentication();
            // Auto-select first model from plan
            try {
                const planModels = plan?.models ?? [];
                const protocol = inputs.protocol ?? providerConfig.protocol;
                const baseUrl = typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl : providerConfig.baseUrl?.[0]?.url;
                if (planModels.length > 0) {
                    const firstModel = planModels[0];
                    const modelId = firstModel.id ?? firstModel;
                    console.error('[AUTO-MODEL] selecting:', modelId);
                    await config.switchModel?.(protocol, modelId, { baseUrl });
                }
            } catch(e) { console.error('[AUTO-MODEL] error:', e.message); }
            const feedbackItem = {`;

if (content.includes(oldText)) {
    content = content.replace(oldText, newText);
    fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
    console.log('Done! Auto-select added.');
} else {
    console.log('ERROR: Text not found!');
}
