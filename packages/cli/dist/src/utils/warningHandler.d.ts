/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * For tests only — uninstall the handler and reset internal state.
 */
export declare function resetWarningHandlerForTests(): void;
/**
 * Install a process-level `warning` handler that swallows the well-known
 * `MaxListenersExceededWarning` for AbortSignal while letting every other
 * warning through — including generic EventTarget leak warnings, which we
 * leave visible because they likely indicate a real leak elsewhere. In
 * debug mode (NODE_ENV=development, or DEBUG / QWEN_DEBUG set), all
 * warnings are forwarded so developers can still see them.
 *
 * Implementation note: simply adding a `warning` listener does NOT prevent
 * Node's default printer from writing to stderr — the default handler is
 * registered as an ordinary listener (`lib/internal/process/warning.js`).
 * To actually suppress targeted warnings, we capture the existing listeners
 * (which include the default printer and any third-party telemetry hooks),
 * remove them, then install ours as the sole listener. Non-suppressed
 * warnings get fanned out to the captured listeners so the default printer
 * still fires for them; suppressed warnings stop here.
 *
 * Idempotent — repeated calls are a no-op.
 */
export declare function initializeWarningHandler(): void;
