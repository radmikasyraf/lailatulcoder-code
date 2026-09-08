const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/gemini.js', 'utf8');

const oldText = ` ...(config.getModelsConfig().getCurrentAuthType() ===\n                    AuthType.NEVER_MATCH_THIS\n                    ? [\n                        'Please run /auth to configure your LailatulCoder.Ai API key.',\n                    ]\n                    : []),`;

if (content.includes(oldText)) {
    content = content.replace(oldText, '');
    fs.writeFileSync('packages/cli/dist/src/gemini.js', content, 'utf8');
    console.log('Done! Banner removed.');
} else {
    console.log('Text not found exactly. Trying partial...');
    // Try partial replace
    content = content.replace(
        "...(config.getModelsConfig().getCurrentAuthType() ===\n                    AuthType.NEVER_MATCH_THIS\n                    ? [\n                        'Please run /auth to configure your LailatulCoder.Ai API key.',\n                    ]\n                    : []),",
        ''
    );
    fs.writeFileSync('packages/cli/dist/src/gemini.js', content, 'utf8');
    
    if (!content.includes('Please run /auth')) {
        console.log('Done via partial match!');
    } else {
        console.log('Still not removed!');
    }
}
