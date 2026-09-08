/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ProjectSummaryInfo } from '@lailatul-coder/lailatul-coder-core';
interface WelcomeBackDialogProps {
    welcomeBackInfo: ProjectSummaryInfo;
    onSelect: (choice: 'restart' | 'continue') => void;
    onClose: () => void;
}
export declare function WelcomeBackDialog({ welcomeBackInfo, onSelect, onClose, }: WelcomeBackDialogProps): import("react").JSX.Element;
export {};
