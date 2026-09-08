/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 *
 * Skills enable/disable dialog (`/skills`).
 *
 * Two key invariants worth knowing before editing:
 *
 *   1. The MultiSelect at the top of the dialog renders ONLY unlocked
 *      skills (skills that the workspace can actually toggle). Skills
 *      disabled at a higher scope (systemDefaults / user / system) are
 *      rendered as a separate "locked" section because the existing
 *      MultiSelect renders `[x]` for any item with `disabled: true`,
 *      which would visually flip the meaning under our checked = enabled
 *      semantic.
 *
 *   2. On confirm, locked names are NEVER re-emitted into the workspace
 *      `skills.disabled` write (Option A in the plan). The workspace
 *      entry would be redundant — the higher scope already disables it —
 *      and keeping a clean settings file matches what the user sees in
 *      the dialog (locked rows can't be toggled here at all).
 */
import type React from 'react';
import type { Config } from '@lailatul-coder/lailatul-coder-core';
import type { LoadedSettings } from '../../../config/settings.js';
import type { UseHistoryManagerReturn } from '../../hooks/useHistoryManager.js';
interface SkillsManagerDialogProps {
    settings: LoadedSettings;
    config: Config | null;
    addItem: UseHistoryManagerReturn['addItem'];
    onClose: () => void;
    reloadCommands: () => void | Promise<void>;
    /**
     * Called when the user picks a skill via Enter — the dialog closes and
     * the supplied text (e.g. `/skill-name`) is dropped into the chat input
     * buffer WITHOUT submitting. The user can review/edit and press Enter
     * themselves to send. Pending enable/disable toggles are saved first.
     */
    setInputBuffer: (text: string) => void;
    availableTerminalHeight?: number;
}
export declare function SkillsManagerDialog({ settings, config, addItem, onClose, reloadCommands, setInputBuffer, availableTerminalHeight, }: SkillsManagerDialogProps): React.JSX.Element;
export {};
