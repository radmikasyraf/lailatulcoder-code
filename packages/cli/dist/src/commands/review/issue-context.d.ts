/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
/** An explicitly requested issue, with its own repository coordinate. */
export interface RequestedIssue {
    number: number;
    /** The issue's repo — `123` resolves to the PR's repo; `owner/repo#123` carries its own. */
    ownerRepo: string;
}
interface IssueContextArgs {
    prNumber: number;
    repo: string;
    out: string;
    /** Additional issues to fetch beyond the closing set (from --issue). */
    extraIssues: RequestedIssue[];
    /** The `--host` flag, fed to platform detection (an Aone host selects a1). */
    host?: string;
}
export interface IssueContextResult {
    closingIssues: Array<{
        number: number;
        ownerRepo: string;
        title: string;
    }>;
    /** References whose fetch failed — partial evidence beats no evidence. */
    unfetchable: Array<{
        number: number;
        ownerRepo: string;
        error: string;
    }>;
    /** Set when the closing-issue discovery itself failed (set is UNKNOWN). */
    discoveryError?: string;
    outPath: string;
}
export declare function runIssueContext(args: IssueContextArgs): IssueContextResult;
export declare const issueContextCommand: CommandModule;
export {};
