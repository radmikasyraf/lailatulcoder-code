/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare function parseSandboxMountSpec(rawMount: string, platform?: NodeJS.Platform): {
    from: string;
    to: string;
    opts: string;
};
