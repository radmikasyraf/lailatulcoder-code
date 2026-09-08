/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Safely stringifies an object to JSON, handling circular references by replacing them with [Circular].
 *
 * Only true cycles (an object reachable from itself along the current ancestor
 * path) are replaced. Duplicate references (the same object appearing in
 * multiple sibling positions) are preserved as full copies, matching the
 * behavior of `JSON.stringify` on acyclic graphs.
 *
 * @param obj - The object to stringify
 * @param space - Optional space parameter for formatting (defaults to no formatting)
 * @returns JSON string with circular references replaced by [Circular]
 */
export declare function safeJsonStringify(obj: unknown, space?: string | number): string;
