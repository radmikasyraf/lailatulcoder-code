/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Split a raw argument string on whitespace, honoring single and double
 * quotes (quotes are stripped, their content kept verbatim — a quoted path
 * with spaces or shell metacharacters survives as one literal token).
 */
export declare function tokenizeArgs(raw: string): string[];
