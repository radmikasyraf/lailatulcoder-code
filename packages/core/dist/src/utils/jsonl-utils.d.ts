/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
type JsonlReadOptions = {
    throwOnNonEnoentError?: boolean;
};
type JsonlReadLinesOptions = {
    signal?: AbortSignal;
};
export declare function _recoverObjectsFromLine<T = unknown>(line: string): T[];
export declare function parseLineTolerant<T>(line: string, filePath: string): T[];
export declare function readLines<T = unknown>(filePath: string, count: number, options?: JsonlReadLinesOptions): Promise<T[]>;
/**
 * Reads every record from the first `count` non-empty lines. `complete`
 * reports whether each of those lines was fully recoverable, so fail-closed
 * callers get a deterministic line-prefix coverage rather than one that
 * shrinks when early lines are `}{`-glued.
 */
export declare function readLinesWithIntegrity<T = unknown>(filePath: string, count: number, options?: JsonlReadLinesOptions): Promise<{
    records: T[];
    complete: boolean;
}>;
/**
 * Reads all lines from a JSONL file.
 * Returns an array of parsed objects.
 */
export declare function read<T = unknown>(filePath: string, options?: JsonlReadOptions): Promise<T[]>;
/**
 * Test-only: clear the per-directory mkdir cache. Needed when tests mutate
 * fs state at the same directory path across cases.
 */
export declare function _resetEnsuredDirsCacheForTest(): void;
/**
 * Appends a line to a JSONL file with concurrency control.
 * Uses a per-file mutex so concurrent callers serialize, and `fs.promises`
 * so the actual I/O does not block the event loop.
 */
export declare function writeLine(filePath: string, data: unknown): Promise<void>;
/**
 * Synchronous version of writeLine for use in non-async contexts.
 *
 * NOTE: this function is unsynchronized — there is no locking. The
 * `writeLine` async variant uses a per-file `Mutex` to serialize
 * concurrent writers, but that lock is bypassed by `writeLineSync`
 * and `write()`. Callers that share a JSONL file with concurrent
 * `writeLine()` callers must serialize externally.
 *
 * `flush: true` fsyncs after each appended record so a `kill -9`
 * mid-tool-call cannot leave a glued `}{` record on disk (closes
 * #3681). The line is converted to a `Buffer` for forward-compat
 * insurance — strace on Node v22/v24 confirms string + utf8 +
 * flush:true does fsync correctly today, but Buffer is the
 * unambiguous slow-path form and protects against any future C++
 * fast-path optimization that might bypass the flush hook for
 * strings.
 */
export declare function writeLineSync(filePath: string, data: unknown): void;
/**
 * Overwrites a JSONL file with an array of objects.
 * Each object will be written as a separate line.
 */
export declare function write(filePath: string, data: unknown[]): void;
/**
 * Counts the number of non-empty lines in a JSONL file.
 */
export declare function countLines(filePath: string): Promise<number>;
/**
 * Checks if a JSONL file exists and is not empty.
 */
export declare function exists(filePath: string): boolean;
export {};
