/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Extension } from '@lailatul-coder/lailatul-coder-core';
interface UninstallConfirmStepProps {
    selectedExtension: Extension | null;
    onConfirm: (extension: Extension) => Promise<void>;
    onNavigateBack: () => void;
    /** Whether this step should respond to keyboard input (default true). */
    isActive?: boolean;
}
export declare function UninstallConfirmStep({ selectedExtension, onConfirm, onNavigateBack, isActive, }: UninstallConfirmStepProps): import("react").JSX.Element;
export {};
