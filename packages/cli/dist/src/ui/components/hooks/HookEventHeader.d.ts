/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HookEventDisplayInfo } from './types.js';
interface HookEventHeaderProps {
    title: string;
    description: string;
    exitCodes: HookEventDisplayInfo['exitCodes'];
}
export declare function HookEventHeader({ title, description, exitCodes, }: HookEventHeaderProps): React.JSX.Element;
export {};
