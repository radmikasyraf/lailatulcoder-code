/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PlatformKind, ReviewPlatformReader } from './types.js';
/** A hint the caller already has about which platform the target lives on. */
export interface PlatformHint {
    /** A `--host` flag or a host discovered elsewhere. */
    host?: string;
    /** A git remote URL (e.g. the `--remote` under review). */
    remoteUrl?: string;
}
/** Hosts that identify Aone Code (web host + git host). Delegates to the
 *  canonical remote-match predicate so every Aone-family gate normalizes
 *  identically (port, trailing-dot FQDN spelling, case) — a dotted-spelling
 *  clone that passes detection cannot be refused by a downstream gate that
 *  normalized differently. */
export declare function isAoneHost(host: string | undefined): boolean;
export declare function detectPlatformKind(hint?: PlatformHint): PlatformKind;
export declare function getPlatformReader(hint?: PlatformHint): ReviewPlatformReader;
