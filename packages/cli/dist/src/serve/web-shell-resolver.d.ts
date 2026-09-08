/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Locate the built Web Shell assets directory (the one containing
 * `index.html` + `assets/`). Returns `undefined` when the assets are not
 * present so serve can degrade to API-only instead of crashing.
 */
export declare function resolveWebShellDir(): string | undefined;
