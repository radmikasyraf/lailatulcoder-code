/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@lailatul-coder/lailatul-coder-core';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';
interface McpServerActionsViewProps {
    config: Config;
    /** Name of the installed MCP server to manage. */
    serverName: string;
    /** Whether this view should respond to keyboard input. */
    isActive: boolean;
    onStatus: (status: StatusMessage | null) => void;
    /** Ask the parent list to reload (state changed). */
    onReload: () => void;
    /** Leave the detail and return to the list. */
    onExit: () => void;
}
/**
 * MCP server detail + actions inside the extensions manager, reusing the
 * `/mcp` dialog's ServerDetailStep / ToolListStep / AuthenticateStep so the
 * behaviour (live status, view tools, enable/disable, re-authenticate, clear
 * auth) stays identical to `/mcp`.
 */
export declare const McpServerActionsView: ({ config, serverName, isActive, onStatus, onReload, onExit, }: McpServerActionsViewProps) => import("react").JSX.Element;
export {};
