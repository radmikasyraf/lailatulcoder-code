/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { SessionService } from '@lailatul-coder/lailatul-coder-core';
import { type PromptLedgerTerminalRecord } from '@lailatul-coder/acp-bridge/promptLedger';
import type { PromptLedgerSink } from '@lailatul-coder/acp-bridge/bridgeOptions';
import type { BridgeRestoredSession } from '@lailatul-coder/acp-bridge/bridgeTypes';
/**
 * Serve-layer assembly of the bridge's ledger sink: the bridge only calls
 * `appendSync`, and this module owns the path layout via `SessionService`
 * (the ledger lives beside the transcript in the session storage dir).
 */
export declare function createPromptLedgerSink(workspaceCwd: string, sessionRuntimeBaseDir: string): PromptLedgerSink;
/**
 * Uuid of the transcript's last record, or `undefined` without readable
 * evidence (missing file, empty file, torn/corrupt tail). Best-effort by
 * contract: any failure maps to "no marker", never to an admission error.
 */
export declare function readTranscriptTailUuid(transcriptPath: string): string | undefined;
/**
 * Close the loop for prompts left `in_flight` by a daemon that died before
 * publishing (and persisting) their terminal. Called on the cold
 * `POST /session/:id/load` path after `bridge.loadSession` returned:
 *
 * - dangling detection on the ledger (a prompt with `in_flight` and no
 *   terminal);
 * - `detectTurnInterruption` on the transcript tail decides the outcome;
 * - the verdict is appended back to the ledger so the response (and every
 *   later load) sees it.
 *
 * Attribution is guarded four ways (each mirrors a concrete wrong-terminal
 * probe; see the design doc): the dispatch marker (when admission recorded
 * the transcript tail uuid, the target must have written a visible record
 * beyond it — an identity check immune to clock skew), the temporal
 * evidence measured on the same projection the verdict uses, a compression
 * checkpoint after the target's admission voiding the evidence chain, and
 * under FIFO admission the visible tail being strictly newer than every
 * other prompt's settled terminal (a same-millisecond tail, and any tail
 * behind a `prompt_deadline_exceeded` terminal whose wedged turn may still
 * be writing, cannot be attributed).
 *
 * Fail-closed invariant: when the outcome cannot be attributed with
 * confidence, nothing is appended and the prompt stays "unknown" — a
 * wrong terminal is never synthesized.
 */
export declare function reconcileDanglingPromptTerminals(sessionService: SessionService, sessionId: string): Promise<void>;
/**
 * The most recent ledger terminals for the load response, or `undefined`
 * when there is no ledger evidence (field omitted entirely — old clients
 * and no-ledger sessions see the exact pre-existing response shape).
 */
export declare function readRecentPromptTerminals(sessionService: SessionService, sessionId: string): PromptLedgerTerminalRecord[] | undefined;
/**
 * Attach `promptTerminals` to a load response. Kept as a wrapper (rather
 * than mutating the bridge's `BridgeRestoredSession` type) so the serve
 * layer owns this response extension alone.
 */
export declare function withPromptTerminals<T extends BridgeRestoredSession>(session: T, terminals: readonly PromptLedgerTerminalRecord[] | undefined): T | (T & {
    promptTerminals: PromptLedgerTerminalRecord[];
});
