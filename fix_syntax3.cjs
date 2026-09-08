const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Find and show the broken useEffect section
const start = content.indexOf('// Track model yang focused untuk auto-select');
const end = content.indexOf('}, [focusedModelIndex, filteredModelOptions]);', start) + '}, [focusedModelIndex, filteredModelOptions]);'.length;

console.log('Current broken section:');
console.log(JSON.stringify(content.slice(start, end)));
console.log('\nFixing...');

// Replace entire broken section with clean version
const brokenSection = content.slice(start, end);
const cleanSection = `// Track model yang focused untuk auto-select
    useEffect(() => {
        if (focusedModelIndex >= 0 && focusedModelIndex !== -2 && filteredModelOptions[focusedModelIndex]) {
            lastFocusedModelRef.current = filteredModelOptions[focusedModelIndex].key;
        }
    }, [focusedModelIndex, filteredModelOptions]);`;

content = content.replace(brokenSection, cleanSection);
fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done!');
