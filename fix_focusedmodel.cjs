const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// 1. Track lastFocusedModel - model yang highlighted masa Enter
content = content.replace(
  `    const [focusedModelIndex, setFocusedModelIndex] = useState(MODEL_CUSTOM_INPUT_FOCUS_INDEX);`,
  `    const [focusedModelIndex, setFocusedModelIndex] = useState(MODEL_CUSTOM_INPUT_FOCUS_INDEX);
    const lastFocusedModelRef = useRef(null);`
);

// 2. Update lastFocusedModelRef bila focusedModelIndex berubah
content = content.replace(
  `    const recommendedScrollOffset = focusedModelIndex < 0`,
  `    // Track model yang focused untuk auto-select
    useEffect(() => {
        if (focusedModelIndex >= 0 && filteredModelOptions[focusedModelIndex]) {
            lastFocusedModelRef.current = filteredModelOptions[focusedModelIndex].key;
        }
    }, [focusedModelIndex, filteredModelOptions]);
    const recommendedScrollOffset = focusedModelIndex < 0`
);

// 3. Pass primaryModelId masa submit
content = content.replace(
  `        flow.submitModelIds({
              modelIds: mergeModelIds(customModelIdsText, selectedRecommendationKeys),
          });`,
  `        const primaryModelId = lastFocusedModelRef.current ?? mergeModelIds(customModelIdsText, selectedRecommendationKeys)[0];
        flow.submitModelIds({
              modelIds: mergeModelIds(customModelIdsText, selectedRecommendationKeys),
              primaryModelId: primaryModelId,
          });`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! lastFocusedModel tracked.');
