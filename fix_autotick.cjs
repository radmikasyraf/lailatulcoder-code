const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Expose setSelectedRecommendationKeys ke handleFetchModels via ref
content = content.replace(
  `    const [selectedRecommendationKeys, setSelectedRecommendationKeys] = useState(() =>
getRecommendedSelections(selectedModelIds, modelOptions));`,
  `    const [selectedRecommendationKeys, setSelectedRecommendationKeys] = useState(() =>
getRecommendedSelections(selectedModelIds, modelOptions));
    const setSelectedRecommendationKeysRef = useRef(null);
    setSelectedRecommendationKeysRef.current = setSelectedRecommendationKeys;`
);

// Tambah auto-tick dalam fetch success handler
content = content.replace(
  `                fetchedRef.current = models;
                setIsFetching(false);`,
  `                fetchedRef.current = models;
                setIsFetching(false);
                // Auto-tick semua fetched models
                if (setSelectedRecommendationKeysRef.current) {
                    const allKeys = new Set(models.map(m => m.id));
                    setSelectedRecommendationKeysRef.current(allKeys);
                }`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Auto-tick all models after fetch.');
