const fs = require('fs');
let content = fs.readFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', 'utf8');

// Tukar labels
content = content
  .replace("title: t('Alibaba ModelStudio')", "title: t('LailatulCoder.Ai Authentication')")
  .replace("label: t('Alibaba ModelStudio')", "label: t('LailatulCoder.Ai Authentication')")
  .replace("description: t('Official recommended setup: Coding Plan, Token Plan, or Standard API Key')", "description: t('Connect with your LailatulCoder.Ai API key')")
  .replace("t('Alibaba ModelStudio \u00b7 Access Method')", "t('LailatulCoder.Ai Authentication')")
  .replace("t('Alibaba ModelStudio \u00c2\u00b7 Access Method')", "t('LailatulCoder.Ai Authentication')")
  .replace('https://qwenlm.github.io/qwen-code-docs/en/users/support/tos-privacy/', 'https://lailatulcoder.ai/terms');

// Buang Third-party Providers dari MAIN_ITEMS
content = content.replace(
  `    {
        key: 'THIRD_PARTY_PROVIDERS',
        title: t('Third-party Providers'),
        label: t('Third-party Providers'),
        description: t('Choose a built-in provider and connect with an API key'),
        value: 'THIRD_PARTY_PROVIDERS',
    },`,
  ''
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', content, 'utf8');
console.log('Done!');
