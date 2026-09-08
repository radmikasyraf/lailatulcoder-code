/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Storage } from '@lailatul-coder/lailatul-coder-core';
export interface UseShellHistoryReturn {
    history: string[];
    addCommandToHistory: (command: string) => void;
    getPreviousCommand: () => string | null;
    getNextCommand: () => string | null;
    resetHistoryPosition: () => void;
}
export declare function useShellHistory(projectRoot: string, storage?: Storage): UseShellHistoryReturn;
