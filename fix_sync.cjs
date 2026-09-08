const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tambah useEffect untuk sync customModelIdsText bila flow.state.modelIds berubah
content = content.replace(
  `    const [modelSearchQuery, setModelSearchQuery] = useState('');`,
  `    const [modelSearchQuery, setModelSearchQuery] = useState('');
    // Sync customModelIdsText bila flow.state.modelIds berubah dari luar (e.g. fetch)
    const prevModelIds = useRef(flow.state.modelIds);
    useEffect(() => {
        if (flow.state.modelIds !== prevModelIds.current) {
            prevModelIds.current = flow.state.modelIds;
            const newCustom = getCustomModelIdsText(
                normalizeModelIds(flow.state.modelIds),
                recommendedModelIds
            );
            setCustomModelIdsText(newCustom || flow.state.modelIds);
        }
    }, [flow.state.modelIds, recommendedModelIds]);`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! useEffect sync added.');
