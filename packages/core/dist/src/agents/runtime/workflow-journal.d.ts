/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { WorkflowAgentOpts } from './workflow-sandbox.js';
/** Journal-format version tag, prefixed onto every key. */
export declare const JOURNAL_KEY_VERSION = "v2";
export interface JournalStartedEntry {
    type: 'started';
    key: string;
    agentId: string;
}
export interface JournalResultEntry {
    type: 'result';
    key: string;
    agentId: string;
    result: unknown;
}
export type JournalEntry = JournalStartedEntry | JournalResultEntry;
/** Parsed journal: completed results + started-but-maybe-incomplete markers. */
export interface JournalReplay {
    /** key → the completed result entry (last write wins). */
    results: Map<string, JournalResultEntry>;
    /** key → all `started` entries seen (length > 1 ⇒ prior respawns). */
    started: Map<string, JournalStartedEntry[]>;
}
/**
 * Project the dispatch-affecting opts into a stable canonical string. Only
 * `schema` / `model` / `isolation` / `agentType` / `workingDir` change what
 * the dispatch does; `label` / `phase` / `stallMs` are cosmetic or
 * operational and must NOT bust the cache. Object keys are sorted recursively
 * so a re-serialized schema with reordered keys hashes the same.
 *
 * `workingDir` is dispatch-affecting for the same reason it exists: the same
 * prompt run against two different worktrees is two different questions. Were
 * it projected away, a resume that changed only the directory would replay
 * the previous tree's answers as if they were this one's.
 */
export declare function canonicalizeAgentOpts(opts: WorkflowAgentOpts): string;
/**
 * Derive a dispatch's resume key from the rolling prefix hash, the prompt,
 * and the canonical opts. Returns `{key}`; the caller chains by setting the
 * next `prefixHash = key`.
 */
export declare function deriveAgentKey(prefixHash: string, prompt: string, opts: WorkflowAgentOpts): string;
/**
 * Seed for the resume prefix-hash chain, derived from the run's `args`. Folding
 * `args` into the chain root means a resume with DIFFERENT args produces a
 * disjoint key space: every `agent()` call misses the journal and re-runs live
 * instead of silently replaying the previous run's results. (The tool documents
 * "pass the same args" as a user obligation; this enforces it.)
 */
export declare function deriveArgsSeed(args: unknown): string;
/**
 * Build the replay maps from a flat list of journal entries. `result`
 * entries win last-write; `started` entries accumulate (so a key started
 * N times surfaces N prior attempts for the respawn telemetry).
 */
export declare function buildReplay(entries: JournalEntry[]): JournalReplay;
/**
 * Append-only JSONL journal for one workflow run. Reads tolerate a missing
 * file (fresh run); appends are fire-and-forget at the call site (the
 * orchestrator does not await them on the hot path — a journal write
 * failure must not fail the dispatch).
 */
export declare class WorkflowJournal {
    readonly path: string;
    private pending;
    constructor(path: string);
    /** Load + parse all entries into replay maps. Empty maps if no file. */
    load(): Promise<JournalReplay>;
    /** Append one entry. Rejects only on I/O error (callers `.catch`). */
    append(entry: JournalEntry): Promise<void>;
    /** Wait until every append issued so far has settled. */
    drain(): Promise<void>;
}
