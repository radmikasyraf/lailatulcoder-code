/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
interface SettingsCorruptedDialogProps {
    corruptedPath: string;
    wasRecovered: boolean;
    onExit: () => void;
    onContinue: () => void;
}
export declare const SettingsCorruptedDialog: React.FC<SettingsCorruptedDialogProps>;
export {};
