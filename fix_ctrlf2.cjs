const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Buang Ctrl+F dari keypress handler lama
content = content.replace(
  `        if (key.ctrl && key.name === 'f') {
            handleFetchModels();
            return;
        }
        if (focusedModelIndex < 0) {`,
  `        if (focusedModelIndex < 0) {`
);

// Tambah keypress handler baru yang always active - sebelum existing useKeypress
content = content.replace(
  `    useKeypress((key) => {
        if (focusedModelIndex < 0) {`,
  `    // Always-active handler for Ctrl+F fetch
    useKeypress((key) => {
        if (key.ctrl && key.name === 'f') {
            handleFetchModels();
        }
    }, { isActive: true });
    useKeypress((key) => {
        if (focusedModelIndex < 0) {`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Ctrl+F handler now always active.');
