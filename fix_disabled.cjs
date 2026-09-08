const fs = require('fs');

// ── Fix 1: DescriptiveRadioButtonSelect — tambah disabled support ──
let comp = fs.readFileSync('packages/cli/dist/src/ui/components/shared/DescriptiveRadioButtonSelect.js', 'utf8');

comp = comp.replace(
  `export function DescriptiveRadioButtonSelect({ items, initialIndex = 0, onSelect, onHighlight, isFocused = true, showNumbers = false, showScrollArrows = false, maxItemsToShow = 10, itemGap = 0, }) {`,
  `export function DescriptiveRadioButtonSelect({ items, initialIndex = 0, onSelect, onHighlight, isFocused = true, showNumbers = false, showScrollArrows = false, maxItemsToShow = 10, itemGap = 0, }) {
    // Filter disabled items from selection but keep them visible
    const selectableItems = items.filter(i => !i.disabled);
    const wrappedOnSelect = (value) => {
        const item = items.find(i => i.value === value);
        if (item && item.disabled) return;
        if (onSelect) onSelect(value);
    };`
);

comp = comp.replace(
  `renderItem: (item, { titleColor }) => {
            const hasDescription = typeof item.description === 'string'
                ? item.description.trim().length > 0
                : item.description != null;
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: titleColor, children: item.title }), hasDescription &&
                        (typeof item.description === 'string' ? (_jsx(Text, { color: theme.text.secondary, children: item.description })) : (item.description))] }, item.key));
        }`,
  `renderItem: (item, { titleColor }) => {
            const hasDescription = typeof item.description === 'string'
                ? item.description.trim().length > 0
                : item.description != null;
            const isDisabled = !!item.disabled;
            const effectiveTitleColor = isDisabled ? theme.text.secondary : titleColor;
            return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: effectiveTitleColor, dimColor: isDisabled, children: [item.title, isDisabled ? ' (Coming Soon)' : ''] }), hasDescription &&
                        (typeof item.description === 'string' ? (_jsx(Text, { color: theme.text.secondary, dimColor: isDisabled, children: item.description })) : (item.description))] }, item.key));
        }`
);

fs.writeFileSync('packages/cli/dist/src/ui/components/shared/DescriptiveRadioButtonSelect.js', comp, 'utf8');
console.log('Fix 1 done: DescriptiveRadioButtonSelect');

// ── Fix 2: AuthDialog — disable Coding Plan & Token Plan dalam alibaba subpage ──
let auth = fs.readFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', 'utf8');

// Tambah disabled flag pada providerToItem untuk coding-plan dan token-plan
auth = auth.replace(
  `function providerToItem(config) {
    return {
        key: config.id,
        title: t(config.label),
        label: t(config.label),
        description: t(config.description),
        value: config.id,
    };
}`,
  `function providerToItem(config) {
    const DISABLED_PROVIDERS = ['coding-plan', 'token-plan'];
    return {
        key: config.id,
        title: t(config.label),
        label: t(config.label),
        description: t(config.description),
        value: config.id,
        disabled: DISABLED_PROVIDERS.includes(config.id),
    };
}`
);

fs.writeFileSync('packages/cli/dist/src/ui/auth/AuthDialog.js', auth, 'utf8');
console.log('Fix 2 done: AuthDialog disabled providers');
console.log('All done! Run: lailatulcoder');
