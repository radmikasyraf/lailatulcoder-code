/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content, FunctionCall, Part } from '@google/genai';
export declare function collectToolCallIdsFromHistory(history: readonly Content[]): Set<string>;
/**
 * Identity of a tool call for duplicate provider-id replay detection: the
 * same canonical (name, args) key the loop guards use, so "replay" means
 * the exact call the provider already saw answered — not merely a reused
 * id. Providers whose ids are only unique within a single response (e.g.
 * `{name}_{index}` schemes that restart at 0) legitimately reuse ids for
 * different calls; those must not be treated as replays.
 */
export declare function getToolCallFingerprint(name: string | undefined, args: unknown): string;
/**
 * WeakMap-cached variant of {@link getToolCallFingerprint}, keyed by the
 * stable object carrying the call (a `FunctionCall` part or a
 * `ToolCallRequestInfo`). Callers must pass the same `name`/`args` the
 * carrier holds; the cache assumes a carrier's call identity never changes.
 */
export declare function getCachedToolCallFingerprint(carrier: object, name: string | undefined, args: unknown): string;
export declare function getFunctionCallFingerprint(functionCall: FunctionCall): string;
/**
 * True when an incoming provider tool call replays an already-handled call:
 * the provider id was handled before AND the (name, args) fingerprint
 * matches the call that first executed under that id. An id collision with
 * a different fingerprint is a fresh call and must execute (under the
 * unique suffixed id assigned by {@link normalizeModelToolCallIds}).
 * `fingerprint` is the incoming call's fingerprint, computed once per call
 * object via {@link getCachedToolCallFingerprint}.
 */
export declare function isReplayOfHandledToolCall(handledToolCallFingerprints: ReadonlyMap<string, string>, providerCallId: string, fingerprint: string): boolean;
/**
 * Records a call admitted for execution. First-occurrence semantics: a
 * provider id keeps naming the call that first executed under it, so a
 * later id-colliding call (executed under its suffixed id) does not
 * redefine what counts as a replay of the original.
 */
export declare function recordHandledToolCall(handledToolCallFingerprints: Map<string, string>, providerCallId: string, fingerprint: string): void;
export declare function normalizeModelToolCallIds(parts: readonly Part[], usedIds: Set<string>, rawIdsInCurrentTurn: Set<string>, reservedIds?: ReadonlyMap<string, string>): Part[];
export declare function reserveModelToolCallId(rawId: string, usedIds: Set<string>, reservedIds: Map<string, string>): string;
export declare function getProviderToolCallId(functionCall: FunctionCall): string | undefined;
export declare function dedupeToolCallsById<T extends Pick<FunctionCall, 'id'>>(functionCalls: readonly T[]): T[];
