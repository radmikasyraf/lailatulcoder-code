const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Replace auto-tick useEffect dengan simpler approach
content = content.replace(
  `    // Auto-tick semua models bila modelOptions update selepas fetch
    const prevModelOptionsLen = useRef(0);
    useEffect(() => {
        if (modelOptions.length > 0 && modelOptions.length !== prevModelOptionsLen.current && fetchedRef.current.length > 0) {
            prevModelOptionsLen.current = modelOptions.length;
            const allKeys = new Set(modelOptions.map(m => m.key));
            setSelectedRecommendationKeys(allKeys);
        }
    }, [modelOptions]);`,
  ``
);

// Tambah auto-tick dalam fetch success - selepas setFetchedModelsList
content = content.replace(
  `                // Update state to trigger re-render (fetchedModelsList → effectiveModels → modelOptions)
                setFetchedModelsList(models);
                setIsFetching(false);`,
  `                // Update state to trigger re-render (fetchedModelsList → effectiveModels → modelOptions)
                setFetchedModelsList(models);
                setIsFetching(false);
                // Auto-tick all models after re-render
                setTimeout(() => {
                    const allKeys = new Set(models.map(m => m.id));
                    setSelectedRecommendationKeys(allKeys);
                    // Also update flow modelIds
                    flow.changeModelIds(models.map(m => m.id).join(', '));
                }, 100);`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! setTimeout auto-tick added.');
