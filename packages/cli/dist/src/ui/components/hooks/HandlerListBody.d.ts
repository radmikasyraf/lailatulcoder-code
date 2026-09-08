/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HookConfigDisplayInfo } from './types.js';
interface HandlerListBodyProps {
    configs: HookConfigDisplayInfo[];
    selectedIndex: number;
}
export declare function HandlerListBody({ configs, selectedIndex, }: HandlerListBodyProps): React.JSX.Element;
export {};
