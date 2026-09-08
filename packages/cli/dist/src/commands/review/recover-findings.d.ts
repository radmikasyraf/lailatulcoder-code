/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type BudgetStop } from './lib/deadline.js';
interface RecoverFindingsArgs {
    plan: string;
    out: string;
}
/** One findings list a prior round left on disk, named by its record key. */
interface FindingsFileEntry {
    key: string;
    path: string;
    /** The `--round-<k>` baked into the key, when the key carries one. */
    round: number | null;
}
export interface RecoverFindingsResult {
    schemaVersion: 1;
    out: string;
    /** Keys whose agent was certified and whose final text was recovered. */
    recoveredKeys: string[];
    /** Keys the CLI built a prompt for with no certifiable transcript. */
    missingKeys: string[];
    /**
     * Every `.findings.md` in the record dir whose path a CERTIFIED
     * transcript's recorded prompt points at — the model-state snapshots.
     * The record dir is attempt-1-writable, and a planted list the mtime
     * fence admits would otherwise be relayed as the interrupted attempt's
     * own cumulative state; the pointer a certified agent was launched with
     * is the authorship corroboration, and a file it names nowhere is not
     * enumerated.
     */
    findingsFiles: FindingsFileEntry[];
    /** Highest round among certified reverse-audit agents, null if none. */
    latestReverseAuditRound: number | null;
    /** The budget-stop marker still standing, if any (round-cap survives). */
    budgetStop: BudgetStop | null;
    /** How many earlier sessions the run ledger names. */
    priorSessions: number;
    /**
     * The errno when the prompt-record directory could not be listed, else
     * null. An empty recovery and an unreadable one must not print alike: the
     * first says the interrupted attempt achieved nothing, the second says
     * this run cannot tell.
     */
    recordDirUnreadable: string | null;
}
export declare function recoverFindings(args: RecoverFindingsArgs, env?: NodeJS.ProcessEnv): RecoverFindingsResult;
export declare const recoverFindingsCommand: CommandModule;
export {};
