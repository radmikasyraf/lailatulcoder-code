const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Fix 1: Remove broken FOCUS debug block - replace with clean version
// Find the useEffect with FOCUS debug
const brokenUseEffect = content.match(/\/\/ Track model yang focused.*?}\s*\], \[focusedModelIndex, filteredModelOptions\]\);/s);
if (brokenUseEffect) {
    console.log('Found broken useEffect, fixing...');
    content = content.replace(brokenUseEffect[0], 
`    // Track model yang focused untuk auto-select
    useEffect(() => {
        if (focusedModelIndex >= 0 && focusedModelIndex !== -2 && filteredModelOptions[focusedModelIndex]) {
            lastFocusedModelRef.current = filteredModelOptions[focusedModelIndex].key;
        }
    }, [focusedModelIndex, filteredModelOptions]);`);
}

// Fix 2: Remove SUBMIT debug logs  
content = content.replace(
    `        console.error('[SUBMIT] lastFocusedModelRef:', lastFocusedModelRef.current);
        const primaryModelId = lastFocusedModelRef.current ?? mergeModelIds(customModelIdsText, selectedRecommendationKeys)[0];
        console.error('[SUBMIT] primaryModelId:', primaryModelId);`,
    `        const primaryModelId = lastFocusedModelRef.current ?? mergeModelIds(customModelIdsText, selectedRecommendationKeys)[0];`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');

// Verify no syntax issues with a simple check
if (content.includes('Unexpected') || content.includes('skip')) {
    console.log('WARNING: May still have issues');
} else {
    console.log('Done! Cleaned up debug logs.');
}
