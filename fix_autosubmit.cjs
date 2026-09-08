const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Auto-submit selepas fetch berjaya
content = content.replace(
  `                // Store in ref immediately (no re-render delay)
                fetchedRef.current = models;
                // Update text inputs
                setCustomModelIdsText(modelIds);
                flow.changeModelIds(modelIds);
                // Force re-render via state counter
                setIsFetching(false);
                setFetchDone(true);
                setFetchedModels(models);
                setRenderCount(c => c + 1);`,
  `                // Store models and auto-submit
                fetchedRef.current = models;
                setIsFetching(false);
                // Auto-submit with fetched model IDs
                flow.submitModelIds({
                    modelIds: models.map(m => m.id),
                });`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Auto-submit after fetch.');
