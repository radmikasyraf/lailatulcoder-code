const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tukar effectiveModels dari ref ke state
content = content.replace(
  `    const fetchedRef = useRef([]);
    const effectiveModels = fetchedRef.current.length > 0 ? fetchedRef.current : (config.models || []);`,
  `    const fetchedRef = useRef([]);
    const [fetchedModelsList, setFetchedModelsList] = useState([]);
    const effectiveModels = fetchedModelsList.length > 0 ? fetchedModelsList : (config.models || []);`
);

// Update fetch success - set fetchedModelsList state (triggers re-render)
content = content.replace(
  `                fetchedRef.current = models;
                setIsFetching(false);
                // Auto-tick semua fetched models
                if (setSelectedRecommendationKeysRef.current) {
                    const allKeys = new Set(models.map(m => m.id));
                    setSelectedRecommendationKeysRef.current(allKeys);
                }`,
  `                fetchedRef.current = models;
                // Update state to trigger re-render (fetchedModelsList → effectiveModels → modelOptions)
                setFetchedModelsList(models);
                setIsFetching(false);`
);

// Auto-tick dalam useEffect bila modelOptions berubah selepas fetch
content = content.replace(
  `    const setSelectedRecommendationKeysRef = useRef(null);
    setSelectedRecommendationKeysRef.current = setSelectedRecommendationKeys;`,
  `    const setSelectedRecommendationKeysRef = useRef(null);
    setSelectedRecommendationKeysRef.current = setSelectedRecommendationKeys;
    // Auto-tick semua models bila modelOptions update selepas fetch
    const prevModelOptionsLen = useRef(0);
    useEffect(() => {
        if (modelOptions.length > 0 && modelOptions.length !== prevModelOptionsLen.current && fetchedRef.current.length > 0) {
            prevModelOptionsLen.current = modelOptions.length;
            const allKeys = new Set(modelOptions.map(m => m.key));
            setSelectedRecommendationKeys(allKeys);
        }
    }, [modelOptions]);`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! fetchedModelsList state added for proper re-render.');
