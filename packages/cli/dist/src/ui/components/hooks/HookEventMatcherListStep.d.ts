/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HookEventDisplayInfo } from './types.js';
interface HookEventMatcherListStepProps {
    hook: HookEventDisplayInfo;
    selectedIndex: number;
}
export declare function HookEventMatcherListStep({ hook, selectedIndex, }: HookEventMatcherListStepProps): React.JSX.Element;
export {};
