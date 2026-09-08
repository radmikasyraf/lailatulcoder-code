import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { BaseSelectionList } from './BaseSelectionList.js';
/**
 * A radio button select component that displays items with title and description.
 *
 * @template T The type of the value associated with each descriptive radio item.
 */
export function DescriptiveRadioButtonSelect({ items, initialIndex = 0, onSelect, onHighlight, isFocused = true, showNumbers = false, showScrollArrows = false, maxItemsToShow = 10, itemGap = 0, }) {
    // Filter disabled items from selection but keep them visible
    const selectableItems = items.filter(i => !i.disabled);
    const wrappedOnSelect = (value) => {
        const item = items.find(i => i.value === value);
        if (item && item.disabled) return;
        if (onSelect) onSelect(value);
    };
    return (_jsx(BaseSelectionList, { items: items, initialIndex: initialIndex, onSelect: onSelect, onHighlight: onHighlight, isFocused: isFocused, showNumbers: showNumbers, showScrollArrows: showScrollArrows, maxItemsToShow: maxItemsToShow, itemGap: itemGap, renderItem: (item, { titleColor }) => {
            const hasDescription = typeof item.description === 'string'
                ? item.description.trim().length > 0
                : item.description != null;
            const isDisabled = !!item.disabled;
            const effectiveTitleColor = isDisabled ? theme.text.secondary : titleColor;
            return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: effectiveTitleColor, dimColor: isDisabled, children: [item.title, isDisabled ? ' (Coming Soon)' : ''] }), hasDescription &&
                        (typeof item.description === 'string' ? (_jsx(Text, { color: theme.text.secondary, dimColor: isDisabled, children: item.description })) : (item.description))] }, item.key));
        } }));
}
//# sourceMappingURL=DescriptiveRadioButtonSelect.js.map