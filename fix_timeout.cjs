const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Replace fetch success - use multiple setStates dengan setTimeout untuk force re-render
content = content.replace(
  `            .then(models => {
                console.error('[FETCH SUCCESS] models=' + models.length);
                // Set model IDs directly in flow (triggers ink re-render)
                const modelIds = models.map(m => m.id).join(', ');
                flow.changeModelIds(modelIds);
                // Also update local state
                setFetchedModels(models);
                setFetchDone(true);
                setIsFetching(false);
            })`,
  `            .then(models => {
                console.error('[FETCH SUCCESS] models=' + models.length);
                const modelIds = models.map(m => m.id).join(', ');
                // Update states in sequence with small delays to force ink re-render
                setIsFetching(false);
                setTimeout(() => {
                    setFetchedModels(models);
                    setTimeout(() => {
                        setFetchDone(true);
                        flow.changeModelIds(modelIds);
                        // Force customModelIdsText update via callback
                        setCustomModelIdsText(modelIds);
                    }, 50);
                }, 50);
            })`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! setTimeout trick applied.');
