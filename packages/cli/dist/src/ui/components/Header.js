import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { shortenPath, tildeifyPath } from '@lailatul-coder/lailatul-coder-core';
import { theme } from '../semantic-colors.js';
import { shortAsciiLogo, miniAsciiLogo } from './AsciiArt.js';
import { getAsciiArtWidth, getCachedStringWidth } from '../utils/textUtils.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { getRenderableGradientColors } from '../utils/gradientUtils.js';
import { pickAsciiArtTier } from '../utils/customBanner.js';
import { t } from '../../i18n/index.js';
/**
 * Auth display type for the Header component.
 * Simplified representation of authentication method shown to users.
 */
export var AuthDisplayType;
(function (AuthDisplayType) {
    AuthDisplayType["QWEN_OAUTH"] = "qwen_oauth";
    AuthDisplayType["CODING_PLAN"] = "coding_plan";
    AuthDisplayType["API_KEY"] = "api_key";
    AuthDisplayType["UNKNOWN"] = "unknown";
})(AuthDisplayType || (AuthDisplayType = {}));
function formatAuthDisplayType(authDisplayType) {
    if (!authDisplayType || !authDisplayType.trim()) {
        return t('Unknown');
    }
    const value = authDisplayType.trim();
    switch (value) {
        case AuthDisplayType.QWEN_OAUTH:
            return t('LailatulCoder Auth');
        case AuthDisplayType.CODING_PLAN:
            return t('Coding Plan');
        case AuthDisplayType.API_KEY:
            return t('API Key');
        case AuthDisplayType.UNKNOWN:
            return t('Unknown');
        default:
            return authDisplayType;
    }
}
/**
 * Format the version for display. Real semver releases get a "v" prefix
 * ("v0.19.4"); a non-semver fallback such as "unknown" (from getCliVersion when
 * the package version can't be resolved) is shown as-is so we never render a
 * bogus "vunknown".
 */
function formatVersionLabel(version) {
    return /^\d/.test(version) ? `v${version}` : version;
}
export const Header = ({ customAsciiArt, customBannerTitle, customBannerSubtitle, version, authDisplayType, model, workingDirectory, forceFullBanner, }) => {
    const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
    const formattedAuthType = formatAuthDisplayType(authDisplayType);
    const versionLabel = formatVersionLabel(version);
    // Calculate available space properly:
    // First determine if logo can be shown, then use remaining space for path
    const containerMarginX = 2; // marginLeft + marginRight on the outer container
    const logoGap = 2; // Gap between logo and info panel
    const infoPanelPaddingX = 1;
    const infoPanelBorderWidth = 2; // left + right border
    const infoPanelChromeWidth = infoPanelBorderWidth + infoPanelPaddingX * 2;
    // Lowered from 40: the original value reserved so much width for the
    // info panel's path display that a reasonably-sized (not huge) terminal
    // -- e.g. 102 columns -- already failed the full-logo width check with
    // plenty of height to spare, forcing a smaller logo tier unnecessarily.
    // shortenPath() already truncates with an ellipsis when the path is
    // longer than this, so 25 chars stays readable while letting the full
    // logo fit meaningfully smaller terminals.
    const minPathLength = 25; // Minimum readable path length
    const minInfoPanelWidth = minPathLength + infoPanelChromeWidth;
    const availableTerminalWidth = Math.max(0, terminalWidth - containerMarginX * 2);
    // Two distinct fallback paths:
    //   - User supplied a custom tier and at least one tier fits → render that.
    //   - User supplied custom art but neither tier fits → hide the logo column.
    //     Falling back to the bundled LailatulCoder logo here would silently undo a
    //     white-label deployment on narrow terminals.
    //   - User supplied no custom art → fall through to `shortAsciiLogo` and let
    //     the existing width gate decide whether to show or hide it.
    // During auth setup (forceFullBanner) always show the full default
    // LailatulCoder logo + info panel, ignoring custom-art tiers and the
    // width gate below -- this is a distinct, auth-screen-only layout and
    // must never change what the normal chat-screen Header renders.
    const hasCustomArt = !forceFullBanner && Boolean(customAsciiArt?.small || customAsciiArt?.large);
    const customTier = forceFullBanner
        ? undefined
        : pickAsciiArtTier(customAsciiArt?.small, customAsciiArt?.large, availableTerminalWidth, logoGap, minInfoPanelWidth, getAsciiArtWidth);
    // For the default (non-custom) LailatulCoder branding, fall back through
    // full logo -> mini logo -> hidden based on available WIDTH and HEIGHT,
    // mirroring the width-based tier logic pickAsciiArtTier already does for
    // custom art. Two independent constraints, either can force a smaller
    // tier: the full logo is 62 columns wide and 12 rows tall, so a
    // reasonably-sized-but-not-huge terminal (e.g. 102 cols) can already
    // fail the WIDTH check alone even with plenty of height to spare -- the
    // mini logo (31 cols, 6 rows) fits meaningfully smaller terminals on
    // both axes. Below mini logo's thresholds too, fall back to the compact
    // (logo-less) info-panel-only layout.
    const minRowsBelowLogo = 15; // chat content + input box + tips
    const fullLogoWidth = getAsciiArtWidth(shortAsciiLogo);
    const fullLogoLineCount = shortAsciiLogo.split('\n').filter((line) => line.length > 0).length;
    const miniLogoWidth = getAsciiArtWidth(miniAsciiLogo);
    const miniLogoLineCount = miniAsciiLogo.split('\n').filter((line) => line.length > 0).length;
    const fullLogoFits = availableTerminalWidth >= fullLogoWidth + logoGap + minInfoPanelWidth &&
        terminalHeight >= fullLogoLineCount + minRowsBelowLogo;
    const miniLogoFits = availableTerminalWidth >= miniLogoWidth + logoGap + minInfoPanelWidth &&
        terminalHeight >= miniLogoLineCount + minRowsBelowLogo;
    const defaultLogo = fullLogoFits ? shortAsciiLogo : (miniLogoFits ? miniAsciiLogo : '');
    const displayLogo = forceFullBanner
        ? shortAsciiLogo
        : (customTier ?? (hasCustomArt ? '' : defaultLogo));
    const logoWidth = getAsciiArtWidth(displayLogo);
    // Final check kept for parity with the custom-art path (pickAsciiArtTier
    // already validated width for that case, so this is a no-op there); for
    // the default-branding path fullLogoFits/miniLogoFits above already
    // picked a tier that satisfies this.
    const showLogo = forceFullBanner ||
        (displayLogo !== '' &&
            availableTerminalWidth >= logoWidth + logoGap + minInfoPanelWidth);
    // Calculate available width for info panel (use all remaining space)
    // Cap at 60 when in two-column layout (with logo)
    const maxInfoPanelWidth = 60;
    const availableInfoPanelWidth = showLogo
        ? Math.min(availableTerminalWidth - logoWidth - logoGap, maxInfoPanelWidth)
        : availableTerminalWidth;
    // Calculate max path lengths (subtract padding/borders from available space)
    const maxPathLength = Math.max(0, availableInfoPanelWidth - infoPanelChromeWidth);
    const infoPanelContentWidth = Math.max(0, availableInfoPanelWidth - infoPanelChromeWidth);
    const authModelText = `${formattedAuthType} | ${model}`;
    const modelHintText = ' (/model to change)';
    const showModelHint = infoPanelContentWidth > 0 &&
        getCachedStringWidth(authModelText + modelHintText) <=
            infoPanelContentWidth;
    // Now shorten the path to fit the available space
    const tildeifiedPath = tildeifyPath(workingDirectory);
    const shortenedPath = shortenPath(tildeifiedPath, Math.max(3, maxPathLength));
    const displayPath = maxPathLength <= 0
        ? ''
        : shortenedPath.length > maxPathLength
            ? shortenedPath.slice(0, maxPathLength)
            : shortenedPath;
    const gradientColors = getRenderableGradientColors(theme.ui.gradient, [
        theme.text.secondary,
        theme.text.link,
        theme.text.accent,
    ]);

    return (_jsxs(Box, { flexDirection: "row", alignItems: "center", marginX: containerMarginX, width: availableTerminalWidth, children: [showLogo && (_jsxs(_Fragment, { children: [_jsx(Box, { flexShrink: 0, children: gradientColors ? (_jsx(Gradient, { colors: gradientColors, children: _jsx(Text, { children: displayLogo }) })) : (_jsx(Text, { children: displayLogo })) }), _jsx(Box, { width: logoGap })] })), _jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: theme.border.default, paddingX: infoPanelPaddingX, flexGrow: showLogo ? 0 : 1, width: showLogo ? availableInfoPanelWidth : undefined, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, color: theme.text.accent, children: customBannerTitle ? customBannerTitle : '>_ LailatulCoder Ai' }), _jsxs(Text, { color: theme.text.secondary, children: [" (", versionLabel, ")"] })] }), customBannerSubtitle ? (_jsx(Text, { color: theme.text.secondary, children: customBannerSubtitle })) : (_jsx(Text, { children: " " })), _jsxs(Text, { children: [_jsx(Text, { color: theme.text.secondary, children: authModelText }), showModelHint && (_jsx(Text, { color: theme.text.secondary, children: modelHintText }))] }), _jsx(Text, { color: theme.text.secondary, children: displayPath })] })] }));
};
//# sourceMappingURL=Header.js.map