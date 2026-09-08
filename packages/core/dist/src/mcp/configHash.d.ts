/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { MCPServerConfig } from '../config/config.js';
/**
 * Stable, canonical hash of an MCP server config used to bind a user's approval
 * decision to the exact configuration they reviewed. If a project-scoped
 * `.mcp.json` server is later edited, its hash changes and the server returns to
 * `pending` approval (see issue #4615).
 *
 * Object keys are sorted recursively so `{a:1,b:2}` and `{b:2,a:1}` hash the
 * same; array order is preserved (e.g. `args` order is behavioral). Provenance
 * and cosmetic fields are stripped at the TOP level only — a user-defined nested
 * key that happens to be named e.g. `description` inside `env`/`headers` is
 * still hashed.
 *
 * Claude Code truncates similar hashes for reload detection, where collisions
 * are harmless. Approval binding is security-sensitive, so keep the full digest.
 */
export declare function hashMcpServerConfig(config: MCPServerConfig): string;
