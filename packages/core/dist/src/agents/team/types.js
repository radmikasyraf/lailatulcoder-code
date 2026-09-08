/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
// ─── Constants ──────────────────────────────────────────────
/** Maximum number of teammates allowed per team. */
export const MAX_TEAMMATES = 10;
/** Reserved name for the team leader (case-insensitive in messaging). */
export const LEADER_NAME = 'leader';
/** Directory name under ~/.lailatulcoder for team configs. */
export const TEAMS_DIR = 'teams';
/** Directory name under ~/.lailatulcoder for task files. */
export const TASKS_DIR = 'tasks';
/** Filename for the team config within a team directory. */
export const TEAM_CONFIG_FILENAME = 'config.json';
/** Directory name for mailbox inboxes within a team directory. */
export const INBOXES_DIR = 'inboxes';
/**
 * Available teammate colors for UI display.
 * Ordered by visual distinctness; assigned round-robin.
 */
export const TEAMMATE_COLORS = [
    '#FF6B6B', // red
    '#4ECDC4', // teal
    '#45B7D1', // blue
    '#FFA07A', // salmon
    '#98D8C8', // mint
    '#DDA0DD', // plum
    '#F0E68C', // khaki
    '#87CEEB', // sky blue
    '#FFB347', // orange
    '#B0E0E6', // powder blue
];
//# sourceMappingURL=types.js.map