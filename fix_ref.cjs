const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tambah useRef dalam import
content = content.replace(
  `import { useCallback, useMemo, useState, useEffect } from 'react';`,
  `import { useCallback, useMemo, useState, useEffect, useRef } from 'react';`
);

// Tambah fetchedModelIds ref dan counter untuk force re-render
content = content.replace(
  `    const [fetchedModels, setFetchedModels] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [fetchDone, setFetchDone] = useState(false);
    const effectiveModels = fetchedModels.length > 0 ? fetchedModels : (config.models || []);`,
  `    const [fetchedModels, setFetchedModels] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [fetchDone, setFetchDone] = useState(false);
    const [renderCount, setRenderCount] = useState(0);
    const fetchedRef = useRef([]);
    const effectiveModels = fetchedRef.current.length > 0 ? fetchedRef.current : (config.models || []);`
);

// Update fetch success handler
content = content.replace(
  `                setIsFetching(false);
                setTimeout(() => {
                    setFetchedModels(models);
                    setTimeout(() => {
                        setFetchDone(true);
                        flow.changeModelIds(modelIds);
                        // Force customModelIdsText update via callback
                        setCustomModelIdsText(modelIds);
                    }, 50);
                }, 50);`,
  `                // Store in ref immediately (no re-render delay)
                fetchedRef.current = models;
                // Update text inputs
                setCustomModelIdsText(modelIds);
                flow.changeModelIds(modelIds);
                // Force re-render via state counter
                setIsFetching(false);
                setFetchDone(true);
                setFetchedModels(models);
                setRenderCount(c => c + 1);`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! useRef approach applied.');
