/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
export interface SedEditInfo {
    filePath: string;
    pattern: string;
    replacement: string;
    flags: string;
    extendedRegex: boolean;
}
export declare function parseSedEditCommand(command: string): SedEditInfo | null;
export declare function applySedSubstitution(content: string, sedInfo: SedEditInfo): string;
