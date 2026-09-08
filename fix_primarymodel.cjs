const fs = require('fs');

// Fix ProviderSetupSteps
let steps = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

if (steps.includes('lastFocusedModelRef')) {
    console.log('ProviderSetupSteps already has lastFocusedModelRef');
} else {
    console.log('Need to apply ProviderSetupSteps fix first!');
}

// Fix useProviderSetupFlow - tambah primaryModelId dalam buildCurrentInputs
let flow = fs.readFileSync('packages/cli/dist/src/ui/auth/useProviderSetupFlow.js', 'utf8');

flow = flow.replace(
  `    const [modelIds, setModelIds] = useState('');`,
  `    const [modelIds, setModelIds] = useState('');
    const [primaryModelId, setPrimaryModelId] = useState('');`
);

flow = flow.replace(
  `    const submitModelIds = useCallback((overrides) => {
        const normalized = overrides?.modelIds ?? normalizeModelIds(modelIds);
        if (normalized.length === 0) {
            setModelIdsError(t('Model IDs cannot be empty.'));
            return false;
        }
        setModelIds(normalized.join(', '));
        setModelIdsError(null);
        submitOrNext({ ...overrides, modelIds: normalized });
        return true;
    }, [modelIds, submitOrNext]);`,
  `    const submitModelIds = useCallback((overrides) => {
        const normalized = overrides?.modelIds ?? normalizeModelIds(modelIds);
        if (normalized.length === 0) {
            setModelIdsError(t('Model IDs cannot be empty.'));
            return false;
        }
        setModelIds(normalized.join(', '));
        // Save primaryModelId if provided
        if (overrides?.primaryModelId) {
            setPrimaryModelId(overrides.primaryModelId);
        }
        setModelIdsError(null);
        submitOrNext({ ...overrides, modelIds: normalized });
        return true;
    }, [modelIds, submitOrNext]);`
);

// Tambah primaryModelId dalam buildCurrentInputs
flow = flow.replace(
  `    const buildCurrentInputs = useCallback((overrides) => ({
        protocol: provider?.protocolOptions ? protocol : undefined,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        modelIds: normalizeModelIds(modelIds),
        ...overrides,
    }), [provider, protocol, baseUrl, apiKey, modelIds]);`,
  `    const buildCurrentInputs = useCallback((overrides) => ({
        protocol: provider?.protocolOptions ? protocol : undefined,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        modelIds: normalizeModelIds(modelIds),
        primaryModelId: primaryModelId || normalizeModelIds(modelIds)[0],
        ...overrides,
    }), [provider, protocol, baseUrl, apiKey, modelIds, primaryModelId]);`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/useProviderSetupFlow.js', flow, 'utf8');
console.log('Done! primaryModelId passed through flow.');
