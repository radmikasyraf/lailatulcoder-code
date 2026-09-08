/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HookEventDisplayInfo, HookMatcherDisplayInfo } from './types.js';
interface HookMatcherDetailStepProps {
    hookEvent: HookEventDisplayInfo;
    matcherGroup: HookMatcherDisplayInfo;
    selectedIndex: number;
}
export declare function HookMatcherDetailStep({ hookEvent, matcherGroup, selectedIndex, }: HookMatcherDetailStepProps): React.JSX.Element;
export {};
