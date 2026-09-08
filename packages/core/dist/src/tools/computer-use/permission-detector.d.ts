/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
/**
 * What kind of permission issue, if any, the cua-driver MCP result
 * indicates. We classify based on message strings because cua-driver
 * doesn't expose a typed errorKind through MCP. The strings below are
 * taken from cua-driver's macOS permission surface
 * (`libs/cua-driver/rust/crates/platform-macos/src/permissions/`).
 */
export type PermissionErrorKind = 'none' | 'other' | 'accessibility' | 'screenRecording' | 'unknown_permission';
export declare function detectPermissionError(result: CallToolResult): PermissionErrorKind;
