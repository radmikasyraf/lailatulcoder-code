const fs = require('fs');

let content = fs.readFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', 'utf8');

// Tambah auto-fetch useEffect selepas handleFetchModels declaration
content = content.replace(
  `    }, [flow, config]);`,
  `    }, [flow, config]);
    // Auto-fetch models bila component mount (kalau ada API key)
    useEffect(() => {
        const baseUrl = flow.state.baseUrl || (typeof config.baseUrl === 'string' ? config.baseUrl : '');
        const apiKey = flow.state.apiKey || '';
        if (baseUrl && apiKey && !isFetching && fetchedRef.current.length === 0) {
            handleFetchModels();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/ProviderSetupSteps.js', content, 'utf8');
console.log('Done! Auto-fetch on mount added.');
