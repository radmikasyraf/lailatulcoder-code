/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Custom error to signal invalid model stream content that should be retried.
 */
export class InvalidStreamError extends Error {
    type;
    constructor(message, type) {
        super(message);
        this.name = 'InvalidStreamError';
        this.type = type;
    }
}
//# sourceMappingURL=invalid-stream-error.js.map