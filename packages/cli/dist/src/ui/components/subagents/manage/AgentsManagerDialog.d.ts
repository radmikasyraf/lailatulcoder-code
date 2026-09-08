/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@lailatul-coder/lailatul-coder-core';
interface AgentsManagerDialogProps {
    onClose: () => void;
    config: Config | null;
}
/**
 * Main orchestrator component for the agents management dialog.
 */
export declare function AgentsManagerDialog({ onClose, config, }: AgentsManagerDialogProps): import("react").JSX.Element;
export {};
