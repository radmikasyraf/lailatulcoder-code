/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { type CommentKind } from './lib/platform/types.js';
interface CommentBodyArgs {
    id: number;
    kind: CommentKind;
    repo: string;
    prNumber?: number;
    out?: string;
    /** The `--host` flag, fed to platform detection (an Aone host selects a1). */
    host?: string;
}
export declare function runCommentBody(args: CommentBodyArgs): {
    body: string;
    outPath?: string;
};
export declare const commentBodyCommand: CommandModule;
export {};
