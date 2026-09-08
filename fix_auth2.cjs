const fs = require('fs');
let content = fs.readFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', 'utf8');

// Tukar labels sahaja, kekalkan 3 pilihan
content = content
  .replace("title: t('Alibaba ModelStudio')", "title: t('LailatulCoder.Ai Authentication')")
  .replace("label: t('Alibaba ModelStudio')", "label: t('LailatulCoder.Ai Authentication')")
  .replace("description: t('Official recommended setup: Coding Plan, Token Plan, or Standard API Key')", "description: t('Connect with your LailatulCoder.Ai API key')")
  .replace("t('Alibaba ModelStudio \u00b7 Access Method')", "t('LailatulCoder.Ai Authentication')")
  .replace("t('Alibaba ModelStudio \u00c2\u00b7 Access Method')", "t('LailatulCoder.Ai Authentication')")
  .replace("'alibaba-select': t('Alibaba ModelStudio \u00c2\u00b7 Access Method')", "'alibaba-select': t('LailatulCoder.Ai Authentication')")
  .replace("'alibaba-select': t('Alibaba ModelStudio \u00b7 Access Method')", "'alibaba-select': t('LailatulCoder.Ai Authentication')")
  .replace('https://qwenlm.github.io/qwen-code-docs/en/users/support/tos-privacy/', 'https://lailatulcoder.ai/terms');

// Tambah balik Third-party kalau dah terbuang
if (!content.includes('THIRD_PARTY_PROVIDERS')) {
  content = content.replace(
    `    {
        key: 'CUSTOM_PROVIDER',`,
    `    {
        key: 'THIRD_PARTY_PROVIDERS',
        title: t('Third-party Providers'),
        label: t('Third-party Providers'),
        description: t('Choose a built-in provider and connect with an API key'),
        value: 'THIRD_PARTY_PROVIDERS',
    },
    {
        key: 'CUSTOM_PROVIDER',`
  );
}

fs.writeFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', content, 'utf8');
console.log('Done!');
