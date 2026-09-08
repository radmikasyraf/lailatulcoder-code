const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

// Replace auto-select yang guna allModels dengan guna plan
content = content.replace(
  `            completeAuthentication();
              // Auto-select first model after auth
              try {
                  const allModels = config.getAllConfiguredModels?.() ?? [];
                  if (allModels.length > 0) {
                      const first = allModels[0];
                      await config.switchModel?.(first.authType, first.id, { baseUrl: first.baseUrl });
                  }
              } catch(e) { console.error('[AUTO-MODEL]', e.message); }`,
  `            completeAuthentication();
              // Auto-select first model from plan (model yang user pilih masa auth)
              try {
                  const planModels = plan?.models ?? plan?.modelProviders ?? [];
                  const protocol = inputs.protocol ?? providerConfig.protocol;
                  const baseUrl = plan?.baseUrl ?? providerConfig.baseUrl;
                  if (planModels.length > 0) {
                      const firstModel = planModels[0];
                      const modelId = firstModel.id ?? firstModel;
                      console.error('[AUTO-MODEL] selecting:', modelId, 'protocol:', protocol);
                      await config.switchModel?.(protocol, modelId, { baseUrl: typeof baseUrl === 'string' ? baseUrl : baseUrl?.[0]?.url });
                  }
              } catch(e) { console.error('[AUTO-MODEL] error:', e.message); }`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
console.log('Done! Auto-select uses plan models now.');
