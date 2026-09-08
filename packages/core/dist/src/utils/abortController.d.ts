/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Create an AbortController with its signal pre-configured to allow a sane
 * number of listeners. Use this in place of `new AbortController()` everywhere
 * in production code.
 */
export declare function createAbortController(maxListeners?: number): AbortController;
/**
 * Create a child AbortController that aborts when its parent aborts.
 * Aborting the child does NOT abort the parent.
 *
 * Three invariants keep listener accumulation bounded on long-lived parents
 * even when many short-lived children come and go:
 *  - The parent's abort listener is registered with `{once: true}` so it
 *    removes itself when the parent fires.
 *  - When the child aborts (from any source — parent propagation, manual
 *    abort, etc.), the listener it registered on the parent is actively
 *    removed. This is the key to preventing dead-listener accumulation on
 *    long-lived parents.
 *  - The parent is held via `WeakRef` from the child's reverse-cleanup
 *    closure, so a child being kept alive does not pin its parent.
 *
 * Lifetime contract: the child controller is held strongly by the parent's
 * listener closure until either the parent fires (closure released by
 * `{once: true}` self-removal) or the child aborts (closure released by
 * reverse-cleanup). This means callers can safely pass `child.signal` into
 * async APIs and drop the controller object — the controller will stay
 * alive long enough for parent abort to propagate to the signal.
 *
 * Accepts an `AbortController`, an `AbortSignal`, or `undefined`. Undefined
 * returns a fresh controller with no parent propagation.
 */
export declare function createChildAbortController(parent: AbortController | AbortSignal | undefined, maxListeners?: number): AbortController;
/**
 * Combine N input signals (any undefined entries are ignored) plus an optional
 * timeout into a single child AbortSignal. The returned `cleanup` releases all
 * listeners and clears the timeout — call it on the success path so listeners
 * don't linger on long-lived input signals. Cleanup is idempotent and is also
 * invoked automatically when the returned signal aborts.
 */
export declare function combineAbortSignals(signals: ReadonlyArray<AbortSignal | undefined>, options?: {
    timeoutMs?: number;
    maxListeners?: number;
}): {
    signal: AbortSignal;
    cleanup: () => void;
};
