const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

// Tambah debug untuk log plan structure
content = content.replace(
  `            // Auto-select first model from plan
            try {
                const planModels = plan?.models ?? [];`,
  `            // Auto-select first model from plan
            try {
                console.error('[AUTO-MODEL] plan keys:', Object.keys(plan ?? {}));
                console.error('[AUTO-MODEL] plan:', JSON.stringify(plan).slice(0, 300));
                const planModels = plan?.models ?? [];`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
console.log('Done! Debug added.');
