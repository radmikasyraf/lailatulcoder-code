/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** One subagent, as the harness recorded it. */
export interface AgentRecord {
    agentId: string;
    agentName: string;
    /** The prompt the agent was launched with — the transcript's first record. */
    launchPrompt: string;
    /** Tool calls that came back without an error. */
    successfulToolCalls: number;
    /**
     * Successful tool calls whose arguments named the diff file.
     *
     * The difference between this and `successfulToolCalls` is the difference
     * between an agent that did *something* and one that opened *the diff*. The old
     * check could not tell them apart: it credited a chunk to any agent that made
     * one successful call, and a `glob` for test files is a successful call. What a
     * review has to be able to say is that someone opened the lines it is about to
     * certify.
     */
    diffToolCalls: number;
    /**
     * Diff line ranges this agent demonstrably read, 1-based and inclusive.
     *
     * Taken from the `offset`/`limit` of its successful `read_file` calls on the
     * diff. This is what it *did*, next to what it was *told* to do — an agent
     * handed the bare diff path with no territory (a reverse-audit pass, a
     * verifier) can still show which lines it opened.
     */
    diffReads: Array<[number, number]>;
    /**
     * The arguments of every successful tool call, serialized.
     *
     * So a check can ask "did this agent open *that* file" of any path, not only the
     * diff. The one that matters is the agent's own brief: the launch prompt now
     * points at it rather than containing it, and whether the agent read it is a fact
     * the harness wrote down, not a hope.
     */
    successfulCallArgs: string[];
    /**
     * The arguments of the successful `read_file` calls, serialized — a subset of
     * `successfulCallArgs` for the checks where NAMING a path is not OPENING it.
     * A `search_file_content` or a `list_directory` over the record dir carries
     * the same stringified path in its args without reading a line; the
     * findings-file floor asks whether the list was read, and only a read is a
     * read.
     */
    successfulReadFileArgs: string[];
    /**
     * The session the harness stamped on the records, when it stamped one.
     * Compared against the directory that supplied the file: a transcript
     * COPIED into another session's directory is not that session's evidence,
     * and on the resume path a copy could otherwise earn recovered coverage
     * for an attempt that never ran it.
     */
    recordedSession: string;
    /** The agent's own final text, as the harness saw it. */
    finalText: string;
    /**
     * True when `finalText` is a RETURN rather than progress: no tool activity
     * follows it in the transcript. `parseTranscript` keeps the last non-empty
     * assistant text, which includes narration emitted between tool calls — so
     * an agent that opened its inputs, said "reading the diff now…" and died
     * (or is still running) carries non-empty finalText that certifies
     * nothing. The harness appends records in order and writes the final
     * message last, so text with tool traffic after it is progress by
     * construction.
     */
    returned: boolean;
    /** When the transcript was last written. */
    mtimeMs: number;
    /**
     * True when this record came from an EARLIER attempt's session directory —
     * a resumed run reading the interrupted attempt's evidence. Absent on
     * records from the current session, so existing readers are unchanged.
     */
    fromPriorSession?: boolean;
}
/**
 * Why no transcripts could be read. Never conflated with "the agents idled".
 *
 * Carries the underlying readdir failure as `cause` where one exists, so a
 * caller can distinguish "the directory does not exist yet" (ENOENT — the
 * legitimate pre-launch state of a resumed run's own session) from a real
 * infrastructure fault, which must never be absorbed.
 */
export declare class TranscriptsUnavailableError extends Error {
}
/**
 * The environment this module reads, validated once and returned together.
 *
 * Both halves come from the environment the CLI exported, never from an argument:
 * a path the model can choose is a path the model can point somewhere flattering.
 * `QWEN_CODE_PROJECT_DIR` exists because the project dir is keyed on the session's
 * *launch* cwd, and this subcommand may well be running inside a PR worktree the
 * skill `cd`-ed into — recomputing it from `process.cwd()` yields a directory that
 * never existed. Callers that need both halves (the chat file lives beside the
 * subagent dir) take them here rather than re-reading the env after `transcriptDir`
 * validated it.
 */
export declare function transcriptPaths(env?: NodeJS.ProcessEnv): {
    projectDir: string;
    sessionId: string;
    dir: string;
};
/** Where this session's subagent transcripts live. */
export declare function transcriptDir(env?: NodeJS.ProcessEnv): string;
/** Text out of a record's message parts. */
export declare function textOf(rec: Record<string, unknown>): string;
/**
 * Do these serialized tool-call args name the EXACT `path`?
 *
 * The comparison is against the whole JSON string value — `JSON.stringify`
 * carries the closing quote — so a `${path}.bak`, or any longer path holding
 * this one as a prefix, is NOT credited. Every certification atom that asks
 * "did the agent name this file" routes here: the diff-read half in
 * `parseTranscript` below, and the brief / findings atoms in
 * `certification.ts`. One copy, so a fix to the match semantics
 * (normalisation, escaping, a stricter compare) reaches the whole bar at once
 * rather than half of it.
 *
 * NOT `namesPath` in `utils/findings.ts`: that one matches a path mentioned in
 * PROSE on a name boundary, so it credits `rm /plan/chunk-3.brief.md` for
 * naming the brief. Crediting an agent for deleting a file it never opened is
 * precisely what this predicate must not do, which is why the two keep
 * separate names.
 */
export declare function serializedArgsNamePath(serializedArgs: string, path: string): boolean;
/**
 * The session's subagent transcript files, one listing every reader shares.
 *
 * The coverage gate and the cost ledger both claim to read "the same records",
 * and the harness writes sibling file kinds per agent (`.meta.json`,
 * `.jsonl.stream`) with a generalized `<kind>-<id>.jsonl` namespace planned —
 * so the definition of "which files are transcripts" lives here, once, not in
 * each reader's own filter. Throws on any readdir failure; what the caller
 * does with that (name the fault, or treat an absent dir as "no agents") is
 * its decision.
 */
export declare function listAgentTranscriptFiles(dir: string): string[];
/**
 * Every subagent this session launched, as the harness recorded it.
 *
 * `since` drops transcripts older than the plan they are supposed to be evidence
 * for. The transcript dir is scoped to the *session*, not the review, and nothing
 * prunes it — so a second `/review` in one session would otherwise be satisfied
 * by the first one's agents, and the diff path is stable across runs, so the
 * collision is silent. Pass the plan's mtime.
 */
export declare function readTranscripts(since?: number, env?: NodeJS.ProcessEnv, diffPath?: string): AgentRecord[];
/**
 * The EARLIER sessions of this run, as directories that are actually inside
 * the harness's own tree.
 *
 * The ledger's charset gate keeps an id from traversing out with `..` or a
 * separator, but `subagents/<id>` can itself BE a symlink — and `readdirSync`
 * and `readFileSync` follow one. That would defeat the containment this
 * feature's threat model rests on ("a fabricated id can at most point a
 * reader at a directory inside the harness's own subagents tree"), so a
 * symlinked (or unstattable) prior directory is skipped: invisible evidence
 * re-owes the work, which is the failure direction every reader here takes.
 *
 * Shared by every prior-session consumer — the transcript union and the cost
 * ledger both assemble their paths from this, so the guard cannot be
 * bypassed by a call site that builds its own `join`.
 */
export declare function priorSessionDirs(planPath: string, env?: NodeJS.ProcessEnv): Array<{
    sessionId: string;
    dir: string;
    chatFile: string;
    /** When the NEXT attempt began — this one's upper window. */
    endsAtMs: number | null;
}>;
/**
 * Every subagent THIS RUN launched, across all of the run's sessions.
 *
 * The single-session `readTranscripts` contract is preserved exactly for the
 * current session: an unreadable current directory is an infrastructure fact
 * and throws. A prior session's directory that cannot be read is different —
 * its absence only means the earlier attempt's evidence is invisible, and the
 * failure direction of invisible evidence is "require the work again", which
 * every downstream gate already implements. So prior directories are skipped
 * silently, never fabricated and never fatal.
 *
 * `since` stays the plan's mtime: a resumed run deliberately does not rewrite
 * the plan, which is what keeps the first attempt's records inside the fence.
 *
 * `currentDirOptional` exists for exactly one caller shape: a resumed run
 * reading the PREVIOUS attempt's evidence before this session has launched
 * any agent — the harness creates `subagents/<session>` on the first launch,
 * so at that moment the current directory legitimately does not exist. It is
 * deliberately narrow on both axes: only ENOENT is absorbed (a permission or
 * I/O fault on an existing directory is a live infrastructure fault), and
 * only when this run actually has prior-session evidence to read instead —
 * a run with no ledger and no directory has shown nothing, which is the
 * infrastructure fact this module has always refused to certify past. A
 * missing ENVIRONMENT (no session id, no project dir) still throws.
 */
export declare function readRunTranscripts(planPath: string, since?: number, env?: NodeJS.ProcessEnv, diffPath?: string, opts?: {
    currentDirOptional?: boolean;
}): AgentRecord[];
/**
 * Was this agent given any way to reach the diff?
 *
 * The launch prompt is the harness's record of what the orchestrator actually
 * asked for. A chunk agent whose prompt never names the diff file could not have
 * read it, however confident its answer sounds — and 23 of 23 real ones were
 * launched exactly that way, then said the sentence their prompt had handed them.
 *
 * This is checked against the *prompt*, not the agent's behaviour, because it
 * names the actor that actually failed. "Relaunch the agent" cannot fix a prompt
 * with no diff in it; the second launch is as blind as the first.
 */
export declare function wasGivenTheDiff(rec: AgentRecord, diffPath: string): boolean;
