const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tambah debug dalam fetchModelsFromApi function
content = content.replace(
  `        fetchModelsFromApi(baseUrl, apiKey)
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
            });`,
  `        fetchModelsFromApi(baseUrl, apiKey)
            .then(models => {
                console.error('[FETCH SUCCESS] models=' + models.length);
                setFetchedModels(models);
                setFetchDone(true);
                setIsFetching(false);
                flow.changeModelIds(models.map(m => m.id).join(', '));
            })
            .catch(err => {
                console.error('[FETCH ERROR] ' + err.message + ' ' + err.stack);
                setFetchError('Fetch failed: ' + err.message);
                setIsFetching(false);
            });`
);

// Tambah debug dalam fetchModelsFromApi
content = content.replace(
  `        const req = lib.request(options, (res) => {
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
        req.on('error', reject);`,
  `        const req = lib.request(options, (res) => {
            let data = '';
            console.error('[FETCH HTTP] status=' + res.statusCode);
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.error('[FETCH DATA] len=' + data.length + ' first100=' + data.slice(0,100));
                try {
                    const json = JSON.parse(data);
                    const models = (json.data || [])
                        .filter(m => m.id && !m.id.includes('vocal'))
                        .map(m => ({ id: m.id, contextWindowSize: 200000 }));
                    console.error('[FETCH MODELS] count=' + models.length);
                    resolve(models);
                } catch(e) { console.error('[FETCH PARSE ERROR] ' + e.message); reject(e); }
            });
        });
        req.on('error', (e) => { console.error('[FETCH REQ ERROR] ' + e.message); reject(e); });`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! More debug added.');
