const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/gemini.js', 'utf8');

// Remove the entire OAUTH warning block
content = content.replace(
  /\.\.\.\(config\.getModelsConfig\(\)\.getCurrentAuthType\(\) ===\s+AuthType\.NEVER_MATCH_THIS\s+\? \[\s+'Please run \/auth to configure your LailatulCoder\.Ai API key\.'\s+\]\s+: \[\]\),/g,
  ''
);

fs.writeFileSync('packages/cli/dist/src/gemini.js', content, 'utf8');

// Verify
if (content.includes('Please run /auth')) {
    console.log('WARNING: Still found in file!');
} else {
    console.log('Done! Banner removed successfully.');
}
