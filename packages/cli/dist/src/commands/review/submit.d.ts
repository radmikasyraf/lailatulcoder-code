/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
interface SubmitArgs {
    pr: number;
    repo: string;
    review: string;
    /** The CLI-written record of what the user typed. Overridable for tests. */
    skillArgs?: string;
    userAuthorized: boolean;
    host?: string;
    dryRun: boolean;
}
export declare function runSubmit(args: SubmitArgs, cliVersion?: string, opts?: {
    /** Append the model/version attribution footer (the `review.attribution` setting). */
    attribution?: boolean;
    /** The standing `review.comment` setting, for the authorization gate. */
    defaultComment?: boolean;
    /**
     * The standing `review.severityFloor` setting, raw — handed to the
     * authorization gate's args re-parse so the floor enforcement below can
     * prefer the OPERATOR'S recorded floor over the state's transcription.
     */
    defaultSeverityFloor?: string;
}): void;
export declare const submitCommand: CommandModule;
export {};
