/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * A brightness-representative stand-in for the terminal's own background,
 * derived from its detected dark/light type.
 *
 * The TUI never floods a background of its own, so derived decisions such as
 * software cursor contrast must be made against the terminal background the
 * content actually renders on — not against the active theme's background,
 * which is never painted.
 */
export declare function getEffectiveTerminalBackground(): string;
