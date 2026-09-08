const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tambah debug dalam useEffect
content = content.replace(
  `        if (focusedModelIndex >= 0 && filteredModelOptions[focusedModelIndex]) {
            lastFocusedModelRef.current = filteredModelOptions[focusedModelIndex].key;
        }`,
  `        console.error('[FOCUS] index=' + focusedModelIndex + ' options=' + filteredModelOptions.length + ' model=' + (filteredModelOptions[focusedModelIndex]?.key ?? 'null'));
        if (focusedModelIndex >= 0 && filteredModelOptions[focusedModelIndex]) {
            lastFocusedModelRef.current = filteredModelOptions[focusedModelIndex].key;
            console.error('[FOCUS] set ref to:', lastFocusedModelRef.current);
        }`
);

// Tambah debug dalam submit
content = content.replace(
  `        const primaryModelId = lastFocusedModelRef.current ?? mergeModelIds(customModelIdsText, selectedRecommendationKeys)[0];`,
  `        console.error('[SUBMIT] lastFocusedModelRef:', lastFocusedModelRef.current);
        const primaryModelId = lastFocusedModelRef.current ?? mergeModelIds(customModelIdsText, selectedRecommendationKeys)[0];
        console.error('[SUBMIT] primaryModelId:', primaryModelId);`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Debug added.');
