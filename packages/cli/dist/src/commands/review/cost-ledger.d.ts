/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
interface StreamCost {
    /** `main` for the orchestrator session, else the agent file's id. */
    id: string;
    /** Human label: the role parsed from the launch prompt when one is found. */
    label: string;
    calls: number;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    thoughtsTokens: number;
    firstAt: string | null;
    lastAt: string | null;
}
interface Ledger {
    totals: Omit<StreamCost, 'id' | 'label'> & {
        wallSeconds: number;
    };
    /**
     * Never null: `computeLedger` throws before folding when the current
     * session's chat holds no above-floor record, so a ledger that exists
     * always carries its main loop.
     */
    main: StreamCost;
    agents: StreamCost[];
    /**
     * How many EARLIER sessions of this run (a resumed review) contributed
     * streams. Zero on a run that never resumed; the field then reads as "this
     * ledger is one session's". The interrupted attempt's cost is part of the
     * review's cost — a resume that hid it would report a review as cheaper
     * than it was.
     */
    priorSessions: number;
    /**
     * Streams that exist but could not be read (a stat, read or parse failure).
     * A silent skip would present a lower total as a complete one.
     */
    missingStreams: number;
}
export declare function computeLedger(planPath: string, env?: NodeJS.ProcessEnv): Ledger;
/** The printed block: one summary line, the main loop, the top consumers. */
export declare function renderLedger(ledger: Ledger): string;
export declare const costLedgerCommand: CommandModule;
export {};
