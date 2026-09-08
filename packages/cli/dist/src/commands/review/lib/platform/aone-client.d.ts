/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** Run `a1` with args and return trimmed stdout. Idempotent reads ride a
 *  transient retry. */
export declare function a1(...args: string[]): string;
/** Run `a1` for a WRITE — exactly once, never retried. A transient retry
 *  after the server ACCEPTED the call would duplicate the write (a
 *  double-posted comment), so a write surfaces its first error and the
 *  caller reports what already landed. */
export declare function a1Once(...args: string[]): string;
/** Run `a1 … --format json` and parse the result. The long `--format` flag is
 *  the one every a1 subcommand accepts (`workitem get` has no `-f` shorthand). */
export declare function a1Json<T>(...args: string[]): T;
/** The JSON shape of `a1Once` — the WRITE that reads its result back (the
 *  created comment's id). TOLERANT on purpose, and only here: an exec
 *  failure propagates (the write genuinely failed), but once the exec
 *  SUCCEEDED the write is ACCEPTED — an answer that then fails to parse is
 *  a platform anomaly, not a failed post, and must degrade to `undefined`
 *  ("landed, result unreadable"). A throw instead would let the caller
 *  count an accepted comment as unposted and re-run it into a duplicate. */
export declare function a1JsonOnce<T>(...args: string[]): T | undefined;
/**
 * Fail fast with an actionable message when `a1` cannot run, and return the
 * authenticated account. Runs `a1 auth whoami --format json` ONCE — the
 * JSON spelling fully subsumes a plain auth gate, so presubmit reads its
 * self-PR comparison account off this call instead of spawning a second
 * whoami (which retried its own delays a second time under the same
 * transient outage, and could throw uncaught after the report's graceful
 * path had already been decided). A missing binary (ENOENT — the dominant
 * first-run state for this new dependency) is a different remedy than an
 * unauthenticated one. An EXEC-successful answer that does not parse or
 * names no account returns '': the exec's success already proves the auth
 * state, and an unreadable account fails presubmit's self-PR comparison
 * soft, like the GitHub path's empty login.
 */
export declare function ensureAoneAuthenticated(): string;
