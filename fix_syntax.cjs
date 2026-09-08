const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Fix broken if-else - replace with clean version
const broken = `        if (focusedModelIndex === -2) { /* skip */ } else { console.error('[FOCUS] index=' + focusedModelIndex + ' options=' + filteredModelOptions.length + ' model=' + (filteredModelOptions[focusedModelIndex]?.key ?? 'null'));`;

const fixed = `        if (focusedModelIndex !== -2) { console.error('[FOCUS] index=' + focusedModelIndex + ' options=' + filteredModelOptions.length + ' model=' + (filteredModelOptions[focusedModelIndex]?.key ?? 'null'));`;

if (content.includes(broken)) {
    content = content.replace(broken, fixed);
    fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
    console.log('Done! Syntax fixed.');
} else {
    // Try to find the broken part
    const idx = content.indexOf('focusedModelIndex === -2');
    if (idx >= 0) {
        console.log('Found at:', idx);
        console.log('Context:', content.slice(idx - 20, idx + 300));
    } else {
        console.log('Not found!');
    }
}
