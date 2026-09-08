/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ExtensionsTab, type ExtensionsTabDef } from './types.js';
interface TabBarProps {
    tabs: ExtensionsTabDef[];
    activeTab: ExtensionsTab;
    /** When false, the "tab to cycle" hint is dimmed to signal it is locked. */
    canSwitch: boolean;
}
export declare const TabBar: ({ tabs, activeTab, canSwitch }: TabBarProps) => import("react").JSX.Element;
export {};
