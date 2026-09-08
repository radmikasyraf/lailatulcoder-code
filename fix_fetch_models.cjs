const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// 1. Tambah https import at top
content = content.replace(
  `import { useCallback, useMemo, useState } from 'react';`,
  `import { useCallback, useMemo, useState, useEffect } from 'react';
import * as https from 'https';
import * as http from 'http';`
);

// 2. Tambah fetch helper function sebelum ModelIdsStep
content = content.replace(
  `function ModelIdsStep({ config, flow, }) {`,
  `// ---------------------------------------------------------------------------
// Fetch models from API
// ---------------------------------------------------------------------------
function fetchModelsFromApi(baseUrl, apiKey) {
    return new Promise((resolve, reject) => {
        const url = baseUrl.replace(/\\/$/, '') + '/models';
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
            },
        };
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const models = (json.data || [])
                        .filter(m => m.id && !m.id.includes('vocal'))
                        .map(m => ({ id: m.id, contextWindowSize: 200000 }));
                    resolve(models);
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function ModelIdsStep({ config, flow, }) {`
);

// 3. Tambah fetch state dan logic dalam ModelIdsStep
content = content.replace(
  `    const defaultIds = config.models?.map((m) => m.id).join(', ') ?? '';
    const hasSelectableModels = (config.models?.length ?? 0) > 0;`,
  `    const defaultIds = config.models?.map((m) => m.id).join(', ') ?? '';
    const [fetchedModels, setFetchedModels] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [fetchDone, setFetchDone] = useState(false);
    const effectiveModels = fetchedModels.length > 0 ? fetchedModels : (config.models || []);
    const hasSelectableModels = effectiveModels.length > 0;
    const handleFetchModels = useCallback(() => {
        const baseUrl = flow.state.baseUrl || (typeof config.baseUrl === 'string' ? config.baseUrl : '');
        const apiKey = flow.state.apiKey || '';
        if (!baseUrl || !apiKey) { setFetchError('Base URL and API key required'); return; }
        setIsFetching(true); setFetchError(null);
        fetchModelsFromApi(baseUrl, apiKey)
            .then(models => {
                setFetchedModels(models);
                setFetchDone(true);
                setIsFetching(false);
                // Auto-populate model IDs
                flow.changeModelIds(models.map(m => m.id).join(', '));
            })
            .catch(err => {
                setFetchError('Fetch failed: ' + err.message);
                setIsFetching(false);
            });
    }, [flow, config]);`
);

// 4. Ganti config.models dengan effectiveModels dalam useMemo
content = content.replace(
  `    const modelOptions = useMemo(() => config.models?.map((model) => ({`,
  `    const modelOptions = useMemo(() => effectiveModels?.map((model) => ({`
);

// 5. Tambah fetch button dalam UI - sebelum NAV_HINT_INPUT dalam simple case
content = content.replace(
  `    return (_jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.text.secondary, children: defaultIds
                        ? t('Enter model IDs separated by commas. Examples: {{modelIds}}', {
                            modelIds: defaultIds,
                        })
                        : t('Enter model IDs separated by commas.') }) }), _jsx(Box, { marginTop: 1, children: _jsx(TextInput, { value: flow.state.modelIds, onChange: flow.changeModelIds, onSubmit: () => flow.submitModelIds(), placeholder: defaultIds || 'model-id-1, model-id-2' }, "model-ids-input") }), flow.state.modelIdsError && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.status.error, children: flow.state.modelIdsError }) })), _jsx(NAV_HINT_INPUT, {})] }));`,
  `    return (_jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.text.secondary, children: defaultIds
                        ? t('Enter model IDs separated by commas. Examples: {{modelIds}}', {
                            modelIds: defaultIds,
                        })
                        : t('Enter model IDs separated by commas.') }) }), _jsx(Box, { marginTop: 1, children: _jsx(TextInput, { value: flow.state.modelIds, onChange: flow.changeModelIds, onSubmit: () => flow.submitModelIds(), placeholder: defaultIds || 'model-id-1, model-id-2' }, "model-ids-input") }), _jsx(Box, { marginTop: 1, children: isFetching
                        ? _jsx(Text, { color: theme.text.accent, children: '⏳ Fetching models...' })
                        : _jsxs(Text, { children: [_jsx(Text, { color: theme.text.secondary, children: 'Or press ' }), _jsx(Text, { color: theme.status.success, bold: true, children: 'F' }), _jsx(Text, { color: theme.text.secondary, children: ' to fetch models from API' })] }) }), fetchError && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.status.error, children: fetchError }) })), fetchDone && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.status.success, children: '✅ Models fetched! Press Enter to continue.' }) })), flow.state.modelIdsError && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.status.error, children: flow.state.modelIdsError }) })), _jsx(NAV_HINT_INPUT, {})] }));`
);

// 6. Tambah keypress handler untuk 'f' key - fetch models
content = content.replace(
  `    useKeypress((key) => {
        if (focusedModelIndex < 0) {
            return;
        }`,
  `    useKeypress((key) => {
        if (key.name === 'f' && focusedModelIndex < 0) {
            handleFetchModels();
            return;
        }
        if (focusedModelIndex < 0) {
            return;
        }`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Fetch models support added.');
console.log('- Press F in Model IDs step to fetch from API');
console.log('- Auto-populates model list');
