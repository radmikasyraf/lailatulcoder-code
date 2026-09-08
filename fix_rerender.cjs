const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Replace fetch success handler - force ink re-render by using flow state
content = content.replace(
  `            .then(models => {
                console.error('[FETCH SUCCESS] models=' + models.length);
                setFetchedModels(models);
                setFetchDone(true);
                setIsFetching(false);
                flow.changeModelIds(models.map(m => m.id).join(', '));
            })`,
  `            .then(models => {
                console.error('[FETCH SUCCESS] models=' + models.length);
                // Set model IDs directly in flow (triggers ink re-render)
                const modelIds = models.map(m => m.id).join(', ');
                flow.changeModelIds(modelIds);
                // Also update local state
                setFetchedModels(models);
                setFetchDone(true);
                setIsFetching(false);
            })`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done!');
