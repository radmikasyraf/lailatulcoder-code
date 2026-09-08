/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { StopFailureErrorType } from '@lailatul-coder/lailatul-coder-core';
export declare function classifyApiError(error: {
    message: string;
    status?: number;
}): StopFailureErrorType;
