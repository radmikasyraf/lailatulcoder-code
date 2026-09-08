/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const SESSION_REGISTRY_SCHEMA_VERSION = 1;
/** One live session, as recorded on disk. */
export interface SessionRegistryRecord {
    schemaVersion: number;
    pid: number;
    /** Start-time token guarding against PID reuse; null where unavailable. */
    procStart: string | null;
    /**
     * PID-namespace identity of the writer (see `readPidNamespaceId`);
     * null where the platform does not expose one.
     */
    pidNs: number | null;
    sessionId: string;
    cwd: string;
    /** Short human-facing label, unique-ish per session. */
    name: string;
    /** Epoch milliseconds. */
    startedAt: number;
    qwenVersion: string | null;
}
export interface RegisterSessionFields {
    sessionId: string;
    cwd: string;
    qwenVersion?: string | null;
}
export declare function getSessionRegistryDir(): string;
/**
 * This process's record path. Records are keyed by PID, which collides
 * across PID namespaces and machines; the identity fields inside a
 * record (`pidNs`, the token's boot prefix) decide which side owns a
 * colliding path.
 */
export declare function getSessionRecordPath(): string;
/**
 * Test-only: clear the registration-path capture so a suite starts each
 * test from the unregistered state regardless of what an earlier test
 * registered. Without a reset, tests that need the capture null only
 * pass by accident of test order.
 */
export declare function resetRegisteredRecordPathForTest(): void;
/**
 * A short, stable, human-readable label: the working directory's basename
 * plus two hex characters derived from the session id.
 *
 * The suffix exists because two sessions in the same directory is the
 * common case, not the exception — bare `lailatul-coder` would collide
 * immediately. Two hex characters keep it typeable while making a
 * same-directory collision unlikely rather than certain; callers that
 * need a guaranteed-unique handle should use the session id.
 *
 * Letters, digits and combining marks are matched Unicode-aware: an
 * ASCII-only class would strip a CJK basename down to a bare dash,
 * leaving every such project with an identical, information-free label.
 * The basename is NFC-normalized first and combining marks are kept, so
 * an NFD accent (macOS' default normalization) or an Indic vowel sign is
 * not dashed away mid-word, and the cap counts code points rather than
 * UTF-16 units, so an astral character at the boundary cannot be cut
 * into a lone surrogate.
 */
export declare function deriveSessionName(cwd: string, sessionId: string): string;
/**
 * Write this process's record. Best-effort: a read-only or full home
 * directory must not stop a session from starting, so failures are logged
 * and reported, never thrown.
 *
 * Returns true when the record was written. Returns false — without
 * writing — when the path is already held by a record carrying another
 * namespace's or another machine's identity, or one this build cannot
 * parse because of a newer schema version, or one whose read failed
 * transiently (an intact file cannot be proved unowned this moment): a
 * colliding session on the other side may be live, and overwriting its
 * record would hide it from discovery and destroy it when we exit.
 * Also refuses on Linux when the start token or the PID namespace id
 * stays unreadable after a retry — a tokenless record is impersonable
 * by any same-namespace reader, including another machine sharing the
 * home, and a namespace-less record is neither listed, patched nor
 * swept by any healthy reader, so it would poison its PID slot until
 * removed by hand. In all of these cases this session simply stays
 * undiscoverable.
 */
export declare function registerSession(fields: RegisterSessionFields): Promise<boolean>;
/**
 * Merge `patch` into this process's record.
 *
 * Used when a field changes mid-session — `/clear`, `/resume` and friends
 * swap the session id under a stable PID, and a record still advertising
 * the old id points readers at the wrong transcript.
 *
 * No-ops when the record is missing: a session that failed to register
 * should not be resurrected by a later patch, because the resurrected
 * record would be missing whatever else registration would have set.
 * `procStart` and `pidNs` are excluded from the patch for the same
 * reason the pid is: they are the identity the sweep trusts, and a
 * caller-supplied value could only corrupt it.
 */
export declare function patchSessionRecord(patch: Partial<Omit<SessionRegistryRecord, 'pid' | 'schemaVersion' | 'procStart' | 'pidNs'>>): Promise<void>;
/** Remove this process's record. Safe to call when none was written. */
export declare function unregisterSession(): Promise<void>;
/**
 * Enumerate live sessions, newest first, sweeping records whose process
 * is provably gone.
 *
 * Returns an empty list rather than throwing when the registry directory
 * is missing or unreadable — "no peers" and "cannot look" are the same
 * outcome for every caller, and this sits on interactive paths.
 */
export declare function listLiveSessions(): Promise<SessionRegistryRecord[]>;
