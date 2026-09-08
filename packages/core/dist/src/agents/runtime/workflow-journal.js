/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Same-session workflow resume via a JSONL journal. Every
 * `agent()` dispatch in a run appends a `started` then a `result` line to
 * `<projectDir>/workflows/<runId>/journal.jsonl`. Re-running the workflow
 * with `Workflow({resumeFromRunId})` loads the journal and serves cached
 * results for the longest UNCHANGED PREFIX of `agent()` calls — the first
 * call whose (rolling prefix + prompt + opts) hash diverges, or that has no
 * journaled result, runs live, and every call after it runs live too.
 *
 * Key derivation (matches upstream `v2`): each dispatch's key is
 * `v2:sha256(prefixHash ‖ prompt ‖ canonicalOpts)`, where `prefixHash` is
 * the PREVIOUS dispatch's key (rolling chain, empty for the first call).
 * Chaining is what gives "longest unchanged prefix" semantics: editing
 * call #3 changes its key, which changes #4's prefix, which changes #4's
 * key, and so on — so the cache naturally invalidates from the edit point.
 *
 * The `canonicalOpts` projection keeps only the dispatch-affecting opts
 * (`schema`, `model`, `isolation`, `agentType`, `workingDir`) with object keys
 * sorted, so cosmetic opt differences (a re-ordered schema, a `label` change)
 * don't bust the cache.
 *
 * Determinism requirement: workflow scripts are deterministic (`Date.now`
 * / `Math.random` throw in the sandbox), so the sequence of `agent()`
 * calls — and therefore the key chain — is stable across runs. That is the
 * precondition that makes prefix-hash caching correct.
 */
import { createHash } from 'node:crypto';
import { read, writeLine } from '../../utils/jsonl-utils.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
const debugLogger = createDebugLogger('WORKFLOW_JOURNAL');
/** Journal-format version tag, prefixed onto every key. */
export const JOURNAL_KEY_VERSION = 'v2';
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
export function canonicalizeAgentOpts(opts) {
    const projected = {};
    for (const k of [
        'schema',
        'model',
        'isolation',
        'agentType',
        'workingDir',
    ]) {
        const v = opts[k];
        if (v === undefined || typeof v === 'function')
            continue;
        projected[k] = v;
    }
    const sortDeep = (val) => {
        if (typeof val === 'function')
            return undefined;
        if (Array.isArray(val))
            return val.map(sortDeep);
        if (val && typeof val === 'object') {
            const out = {};
            for (const key of Object.keys(val).sort()) {
                if (key === '__proto__')
                    continue;
                out[key] = sortDeep(val[key]);
            }
            return out;
        }
        return val;
    };
    try {
        return JSON.stringify(sortDeep(projected));
    }
    catch {
        // A non-serializable opt (shouldn't happen — opts are JSON-revived
        // before crossing the vm boundary) falls back to an empty projection
        // so the dispatch still gets a stable (prompt-only) key.
        return '{}';
    }
}
/**
 * Derive a dispatch's resume key from the rolling prefix hash, the prompt,
 * and the canonical opts. Returns `{key}`; the caller chains by setting the
 * next `prefixHash = key`.
 */
export function deriveAgentKey(prefixHash, prompt, opts) {
    const hash = createHash('sha256');
    hash.update(prefixHash);
    hash.update('\0');
    hash.update(prompt);
    hash.update('\0');
    hash.update(canonicalizeAgentOpts(opts));
    return `${JOURNAL_KEY_VERSION}:${hash.digest('hex')}`;
}
/**
 * Seed for the resume prefix-hash chain, derived from the run's `args`. Folding
 * `args` into the chain root means a resume with DIFFERENT args produces a
 * disjoint key space: every `agent()` call misses the journal and re-runs live
 * instead of silently replaying the previous run's results. (The tool documents
 * "pass the same args" as a user obligation; this enforces it.)
 */
export function deriveArgsSeed(args) {
    const hash = createHash('sha256');
    let serialized;
    try {
        serialized = JSON.stringify(args ?? null) ?? 'null';
    }
    catch {
        // `args` is contractually JSON; a non-serializable value (cycle/BigInt)
        // hashes to a stable sentinel so the chain stays deterministic.
        serialized = 'non-serializable-args';
    }
    hash.update(serialized);
    return `${JOURNAL_KEY_VERSION}:${hash.digest('hex')}`;
}
/**
 * Build the replay maps from a flat list of journal entries. `result`
 * entries win last-write; `started` entries accumulate (so a key started
 * N times surfaces N prior attempts for the respawn telemetry).
 */
export function buildReplay(entries) {
    const results = new Map();
    const started = new Map();
    for (const e of entries) {
        if (e.type === 'result') {
            results.set(e.key, e);
        }
        else if (e.type === 'started') {
            const list = started.get(e.key);
            if (list)
                list.push(e);
            else
                started.set(e.key, [e]);
        }
    }
    return { results, started };
}
/**
 * Append-only JSONL journal for one workflow run. Reads tolerate a missing
 * file (fresh run); appends are fire-and-forget at the call site (the
 * orchestrator does not await them on the hot path — a journal write
 * failure must not fail the dispatch).
 */
export class WorkflowJournal {
    path;
    pending = Promise.resolve();
    constructor(path) {
        this.path = path;
    }
    /** Load + parse all entries into replay maps. Empty maps if no file. */
    async load() {
        try {
            const entries = await read(this.path);
            return buildReplay(entries);
        }
        catch (e) {
            debugLogger.warn(`WorkflowJournal.load failed for ${this.path}: ${e}`);
            return { results: new Map(), started: new Map() };
        }
    }
    /** Append one entry. Rejects only on I/O error (callers `.catch`). */
    append(entry) {
        const operation = this.pending.then(() => writeLine(this.path, entry));
        this.pending = operation.catch(() => undefined);
        return operation;
    }
    /** Wait until every append issued so far has settled. */
    drain() {
        return this.pending;
    }
}
//# sourceMappingURL=workflow-journal.js.map