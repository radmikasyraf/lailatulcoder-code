const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/useAuth.js', 'utf8');

// Log more of plan to see full structure
content = content.replace(
  `console.error('[AUTO-MODEL] plan:', JSON.stringify(plan).slice(0, 300));`,
  `console.error('[AUTO-MODEL] plan:', JSON.stringify(plan).slice(0, 500));`
);

// Try different plan properties for models
content = content.replace(
  `                const planModels = plan?.models ?? [];`,
  `                const planModels = plan?.models ?? plan?.modelProviders?.[0]?.models ?? plan?.modelProviders ?? [];
                console.error('[AUTO-MODEL] planModels:', JSON.stringify(planModels).slice(0, 200));`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useAuth.js', content, 'utf8');
console.log('Done!');
