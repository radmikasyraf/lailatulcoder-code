const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

// Tambah auto-select selepas completeAuthentication()
content = content.replace(
  `            completeAuthentication();
              const feedbackItem = {`,
  `            completeAuthentication();
              // Auto-select first model after auth
              try {
                  const allModels = config.getAllConfiguredModels?.() ?? [];
                  if (allModels.length > 0) {
                      const first = allModels[0];
                      await config.switchModel?.(first.authType, first.id, { baseUrl: first.baseUrl });
                  }
              } catch(e) { console.error('[AUTO-MODEL]', e.message); }
              const feedbackItem = {`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
console.log('Done! Auto-select first model after auth.');
