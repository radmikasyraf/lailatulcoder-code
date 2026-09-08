/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * True when the given PID belongs to a live process.
 *
 * `EPERM` (and Windows' `EACCES`) means the process exists but is owned
 * by another user — that is still alive, and reporting it as dead would
 * let one user's session sweep another's record out of a shared registry
 * directory. The zombie exclusion still applies on that path: the kernel
 * permission-checks signal 0 regardless of the target's state, so a
 * cross-user zombie reaches the catch too.
 */
export declare function isPidAlive(pid: number): boolean;
/**
 * An opaque token that changes when a PID is recycled, or `null` when the
 * platform does not expose one cheaply.
 *
 * Backed by `boot_id` plus the `starttime` field of `/proc/<pid>/stat`
 * on Linux — the process start time in clock ticks since boot. Two processes
 * sharing a PID within one boot will not share `starttime`; across a
 * reboot they can, and a registry record outlives a reboot whenever the
 * machine crashes or loses power, so the boot id is what makes every
 * pre-reboot token provably foreign.
 *
 * `session-writer-lease.ts`'s `readProcessStartIdentity` builds the same
 * Linux identity, and is deliberately left alone: its token is a
 * persisted on-disk format with takeover semantics, so unifying them is a
 * change to that file's contract rather than a refactor. If a third
 * caller ever needs this, it imports from here — two is already the
 * limit.
 *
 * When the boot id is unreadable this returns `null` rather than a bare
 * tick count: emitting two token shapes on one machine would let a reader
 * that has the boot id "mismatch" a live session recorded without it and
 * sweep its record. A `null` degrades to a plain liveness check instead.
 *
 * Returns `null` on every non-Linux platform rather than shelling out to
 * `ps`: callers must already tolerate a missing token (the registry falls
 * back to a plain liveness check), and a subprocess per record would make
 * enumeration far more expensive than the problem it solves.
 */
export declare function readProcStartToken(pid: number): string | null;
export declare function readLocalBootId(): string | null;
/**
 * The identity of the PID namespace this process lives in (the inode of
 * `/proc/self/ns/pid`), or `null` where the platform does not expose it.
 *
 * PID numbers and start-time tokens are only meaningful within the
 * namespace that assigned them: two sessions in separate namespaces can
 * share one `~/.qwen` (host + devcontainer with a mounted home, sibling
 * CI containers, NFS homes), and each side's sweep would otherwise judge
 * the other's records by PIDs that resolve to nothing — or worse, to a
 * different process — on its own side. Records carry this identity so a
 * reader can tell its own namespace's records from a foreign one's.
 */
export declare function readPidNamespaceId(): number | null;
/**
 * True when `pid` is alive AND is the same process that recorded
 * `procStart`.
 *
 * A `null` recorded token (written on a platform without one) or a `null`
 * current token (the process died between the two reads, or `/proc` is not
 * readable) degrades to a plain liveness check rather than declaring the
 * record stale — deleting a live session's record is the worse failure.
 */
export declare function isSameProcess(pid: number, procStart: string | null | undefined): boolean;
