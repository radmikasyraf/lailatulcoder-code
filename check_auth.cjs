const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

// Check what's there
const idx = content.indexOf('completeAuthentication();');
console.log('Found completeAuthentication at index:', idx);
console.log('Context around it:');
console.log(content.slice(idx - 50, idx + 200));
