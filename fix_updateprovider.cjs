const fs = require('fs');

// ── Fix 1: useProviderSetupFlow - expose updateProvider function ──
let flow = fs.readFileSync('packages/cli/dist/src/ui/auth/useProviderSetupFlow.js', 'utf8');

// Tambah updateProvider function - cari return statement dalam hook
flow = flow.replace(
  `    const reset = useCallback(() => {
        setProvider(null);
        setVisibleSteps([]);
        setStepIndex(0);
    }, []);`,
  `    const reset = useCallback(() => {
        setProvider(null);
        setVisibleSteps([]);
        setStepIndex(0);
    }, []);
    // Update provider config (e.g. after fetching models)
    const updateProvider = useCallback((updates) => {
        setProvider((prev) => prev ? { ...prev, ...updates } : prev);
    }, []);`
);

// Tambah updateProvider dalam return object - cari return { state, ... }
flow = flow.replace(
  `        reset,`,
  `        reset,
        updateProvider,`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useProviderSetupFlow.js', flow, 'utf8');
console.log('Fix 1 done: updateProvider exposed');

// ── Fix 2: ProviderSetupSteps - use updateProvider to set fetched models ──
let steps = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Update fetch success handler - use updateProvider instead
steps = steps.replace(
  `                // Store models and auto-submit
                fetchedRef.current = models;
                setIsFetching(false);
                // Auto-submit with fetched model IDs
                flow.submitModelIds({
                    modelIds: models.map(m => m.id),
                });`,
  `                console.error('[FETCH] updating provider with models');
                fetchedRef.current = models;
                setIsFetching(false);
                // Update provider config with fetched models - triggers React re-render
                if (flow.updateProvider) {
                    flow.updateProvider({ models: models });
                    // Also set modelIds in flow state
                    flow.changeModelIds(models.map(m => m.id).join(', '));
                } else {
                    // Fallback: auto-submit
                    flow.submitModelIds({ modelIds: models.map(m => m.id) });
                }`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', steps, 'utf8');
console.log('Fix 2 done: ProviderSetupSteps uses updateProvider');
console.log('All done! Test Ctrl+F now.');
