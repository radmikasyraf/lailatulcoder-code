/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { isTruthy } from './bareMode.js';
const SAFE_MODE_ENV_VAR = 'QWEN_CODE_SAFE_MODE';
export function isSafeModeEnv() {
    return isTruthy(process.env[SAFE_MODE_ENV_VAR]);
}
//# sourceMappingURL=safe-mode.js.map