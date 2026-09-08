const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

// Find and replace selectedModelId line
const oldText = `                // Guna modelSelection.modelId - model yang user pilih masa auth
                const selectedModelId = plan?.modelSelection?.modelId;`;

const newText = `                // Guna inputs.modelIds[0] - model pertama yang user pilih dari checkbox
                const selectedModelId = inputs?.modelIds?.[0] ?? plan?.modelSelection?.modelId;`;

if (content.includes(oldText)) {
    content = content.replace(oldText, newText);
    fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
    console.log('Done! Now uses inputs.modelIds[0]');
} else {
    console.log('Text not found! Checking current state...');
    const idx = content.indexOf('selectedModelId');
    console.log('Context:', content.slice(idx - 50, idx + 200));
}
