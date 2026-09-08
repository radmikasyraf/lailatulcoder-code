/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DEFAULT_QWEN_CUSTOM_IGNORE_FILE_NAMES } from '../utils/qwenIgnoreParser.js';
// For memory files
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS = {
    respectGitIgnore: false,
    respectQwenIgnore: true,
    customIgnoreFiles: [...DEFAULT_QWEN_CUSTOM_IGNORE_FILE_NAMES],
};
// For all other files
export const DEFAULT_FILE_FILTERING_OPTIONS = {
    respectGitIgnore: true,
    respectQwenIgnore: true,
    customIgnoreFiles: [...DEFAULT_QWEN_CUSTOM_IGNORE_FILE_NAMES],
};
//# sourceMappingURL=constants.js.map