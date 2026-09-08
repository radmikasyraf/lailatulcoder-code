const fs = require('fs');
let content = fs.readFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', 'utf8');

const oldBlock = /const MAIN_ITEMS = \[[\s\S]*?\];/;

const newBlock = `const MAIN_ITEMS = [
    {
        key: 'ALIBABA_MODELSTUDIO',
        title: t('LailatulCoder.Ai Authentication'),
        label: t('LailatulCoder.Ai Authentication'),
        description: t('Connect with your LailatulCoder.Ai API key'),
        value: 'ALIBABA_MODELSTUDIO',
    },
    {
        key: 'THIRD_PARTY_PROVIDERS',
        title: t('Third-party Providers'),
        label: t('Third-party Providers'),
        description: t('Choose a built-in provider and connect with an API key'),
        value: 'THIRD_PARTY_PROVIDERS',
    },
    {
        key: 'CUSTOM_PROVIDER',
        title: t('Custom Provider'),
        label: t('Custom Provider'),
        description: t('Manually connect a local server, proxy, or unsupported provider'),
        value: 'CUSTOM_PROVIDER',
    },
];`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', content, 'utf8');
console.log('Done! MAIN_ITEMS now has 3 options.');
