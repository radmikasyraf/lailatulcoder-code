/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression tests for vim Esc key isolation.
 *
 * Guards against Esc leaking from vim INSERT mode into AppContainer's
 * escape handler (cancel stream / "Press Esc again to clear").
 */
export {};
