/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HookEventDisplayInfo } from './types.js';
interface HookEventHandlerListStepProps {
    hook: HookEventDisplayInfo;
    selectedIndex: number;
}
export declare function HookEventHandlerListStep({ hook, selectedIndex, }: HookEventHandlerListStepProps): React.JSX.Element;
export {};
