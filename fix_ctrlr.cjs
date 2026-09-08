const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tukar Ctrl+F kepada Ctrl+R
content = content
  .replace(
    `        if (key.ctrl && key.name === 'f') {
            handleFetchModels();
        }`,
    `        if (key.ctrl && key.name === 'r') {
            handleFetchModels();
        }`
  )
  .replace(
    `children: 'Ctrl+F' }), _jsx(Text, { color: theme.text.secondary, children: ' to fetch models from API'`,
    `children: 'Ctrl+R' }), _jsx(Text, { color: theme.text.secondary, children: ' to fetch models from API'`
  );

// Juga patch handleFetchModels untuk log debug
content = content.replace(
  `        fetchModelsFromApi(baseUrl, apiKey)`,
  `        console.error('[FETCH] baseUrl=' + baseUrl + ' apiKey=' + apiKey.slice(0,8) + '...');
        fetchModelsFromApi(baseUrl, apiKey)`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Use Ctrl+R to fetch models now.');
