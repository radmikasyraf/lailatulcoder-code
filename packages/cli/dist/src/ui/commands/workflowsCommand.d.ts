/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { WorkflowTask, WorkflowSnapshot } from '@lailatul-coder/lailatul-coder-core';
import type { SlashCommand } from './types.js';
/**
 * P7b: adapt a persisted snapshot to the `WorkflowTask` shape the row /
 * detail formatters expect. The dialog-only fields (`abortController`,
 * `outputFile`, etc.) are filled with inert values — a snapshot is always
 * terminal, so the controls that read those fields are never reached.
 */
export declare function snapshotToTask(s: WorkflowSnapshot): WorkflowTask;
export declare const workflowsCommand: SlashCommand;
