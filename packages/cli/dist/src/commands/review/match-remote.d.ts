/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
interface MatchRemoteArgs {
    owner: string;
    repo: string;
    /** Absent means inherit an operator-exported GH_HOST, else github.com. */
    host?: string;
    /**
     * The target's FULL group path when its URL grammar carries one (Aone
     * nested groups) — with it, the match compares every path segment
     * against a three-or-more-segment remote; without it, only the
     * non-injective last-two collapse is compared.
     */
    groupPath?: string;
}
export declare function runMatchRemote(args: MatchRemoteArgs): void;
export declare const matchRemoteCommand: CommandModule;
export {};
