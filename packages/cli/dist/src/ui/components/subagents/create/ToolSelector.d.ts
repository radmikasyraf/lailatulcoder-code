/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
interface ToolSelectorProps {
    tools?: string[];
    onSelect: (tools: string[]) => void;
    config: Config | null;
}
/**
 * Tool selection with categories.
 */
export declare function ToolSelector({ tools, onSelect, config, }: ToolSelectorProps): import("react").JSX.Element;
export {};
