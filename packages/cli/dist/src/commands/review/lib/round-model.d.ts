/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * The identity this round runs under.
 *
 * Prefers the PROVIDER-QUALIFIED id (`<model>@<8-hex of authType+baseUrl>`):
 * a bare model id is unique only inside one provider configuration, so two of
 * them exposing the same name would otherwise pass each other's same-model
 * gate and skip code neither reviewed. Falls back to the bare id for a runtime
 * that publishes no identity — whether the slot is absent or BLANK, which are
 * the same fact said two ways — and to `''`, meaning "unknown" and read by
 * every caller as a mismatch rather than as agreement, for a runtime that
 * publishes neither.
 *
 * The empty case is reachable in normal operation, not just in tests: the
 * identity slot is blanked (not omitted) when a session has none to publish,
 * precisely so a stale value from a parent process cannot ride the spawn-site
 * env spread. An empty string therefore means "this runtime told us nothing",
 * and it must never compare equal to another empty one.
 */
export declare function roundModelIdFrom(env: NodeJS.ProcessEnv): string;
/**
 * Is a marker's certifying identity the one running THIS round?
 *
 * Whole-string equality, never a prefix: `qwen3.7-max` must not match
 * `qwen3.7-max@9f8e7d6c`, and two different providers' digests must not match
 * each other — that separation is the only thing the digest buys.
 *
 * Both empty cases are a MISMATCH by construction. An absent `certifier` is a
 * marker written before the field; an empty `running` is a runtime that
 * published no identity at all. Neither knows who reviewed the range, and the
 * fallback for not knowing is always the full review, never a skip.
 */
export declare function certifierMatchesRound(certifier: string | undefined, running: string): boolean;
