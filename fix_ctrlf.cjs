const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tukar F key kepada Ctrl+F
content = content.replace(
  `        if (key.name === 'f' && focusedModelIndex < 0) {
            handleFetchModels();
            return;
        }`,
  `        if (key.ctrl && key.name === 'f') {
            handleFetchModels();
            return;
        }`
);

// Tukar UI hint dari F ke Ctrl+F
content = content.replace(
  `_jsx(Text, { color: theme.status.success, bold: true, children: 'F' }), _jsx(Text, { color: theme.text.secondary, children: ' to fetch models from API' })`,
  `_jsx(Text, { color: theme.status.success, bold: true, children: 'Ctrl+F' }), _jsx(Text, { color: theme.text.secondary, children: ' to fetch models from API' })`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Use Ctrl+F to fetch models now.');
