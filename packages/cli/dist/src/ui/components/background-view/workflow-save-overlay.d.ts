/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview P7b-A3: the "save this run as a reusable workflow" overlay
 * shown inside the `/workflows` detail view. The user names the workflow,
 * toggles project/user scope, and the run's verbatim script is written to
 * `.qwen/workflows/<name>.js`. A name collision prompts for overwrite.
 *
 * Self-contained: it owns a single `useKeypress` (a minimal inline name
 * editor — workflow names are short kebab-case strings, so the full readline
 * machinery of `TextInput` is unnecessary and would fight this overlay for
 * keys). The parent dialog yields all keys to this overlay while it is active.
 */
import type React from 'react';
import { type Config } from '@lailatul-coder/lailatul-coder-core';
interface WorkflowSaveOverlayProps {
    /** The completed run's script source; written verbatim on save. */
    script: string;
    /** Pre-fill the name field (e.g. from the run's `meta.name`). */
    initialName?: string;
    config: Config;
    isActive: boolean;
    /** Closes the overlay; `savedName` is set only on a successful save. */
    onClose: (savedName?: string) => void;
}
export declare const WorkflowSaveOverlay: React.FC<WorkflowSaveOverlayProps>;
export {};
