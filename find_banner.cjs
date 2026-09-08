const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/gemini.js', 'utf8');

// Find the banner text and log surrounding context
const idx = content.indexOf('Please run /auth to configure your LailatulCoder');
console.log('Found at index:', idx);
console.log('Context (100 chars before):');
console.log(JSON.stringify(content.slice(idx - 150, idx + 100)));
