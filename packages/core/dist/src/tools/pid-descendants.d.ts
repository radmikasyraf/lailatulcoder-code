/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Return all descendant PIDs (children, grandchildren, …) of `rootPid`.
 *
 * Cross-platform implementation per `docs/design/f2-mcp-transport-pool.md`
 * Uses this from `PoolEntry.shutdown()` to SIGTERM
 * wrapped server processes (`npx @modelcontextprotocol/server-X`,
 * `uvx ...`, `pnpm dlx ...`) that would otherwise leak when the
 * pool entry's primary child is killed.
 *
 *
 * the implementation switched from per-pid `pgrep -P <pid>` BFS
 * (Linux/macOS) / per-pid `Get-CimInstance -Filter "ParentProcessId=$p"`
 * BFS (Windows) — which forked one subprocess per node visited — to
 * a single process-table snapshot followed by an in-memory tree walk.
 * Two motivations: (1) ~B^D fork count → 1 fork per call, on the
 * hot pool-shutdown path; (2) snapshot consistency — pre-fix BFS
 * could miss descendants that forked between adjacent BFS levels.
 *
 * Behavior:
 *   - Linux/macOS: `ps -A -o pid=,ppid=` snapshot, in-memory BFS walk
 *     over the parsed `Map<ppid, pid[]>`.
 *   - Windows: PowerShell `Get-CimInstance Win32_Process` →
 *     `ConvertTo-Csv` snapshot of all `(ProcessId, ParentProcessId)`
 *     rows, in-memory walk.
 *   - Either platform: graceful degradation if the snapshot tool is
 *     missing / blocked / times out — falls back to per-pid BFS
 *     (preserves the pre-fix code path so BusyBox `ps` <v1.28 without
 *     `-o` support, distroless containers without `ps`, etc. still
 *     behave at-least-as-well as before). If BOTH the snapshot AND
 *     the fallback fail, returns empty so the caller's SIGTERM step
 *     skips and the OS reaps orphans (Linux init, Windows job objects).
 *
 * Returns descendants in **breadth-first order** — children before
 * grandchildren. Caller typically iterates back-to-front so deepest
 * processes get SIGTERM first.
 */
export declare function listDescendantPids(rootPid: number): Promise<number[]>;
/**
 * Send SIGTERM to a list of pids, tolerating per-pid failures
 * (already exited, permission denied, etc.). On Windows, Node's
 * `process.kill(pid, 'SIGTERM')` polyfills to `TerminateProcess`
 * (similar to `taskkill /F`) — so the same call works cross-platform
 * and we don't shell out to taskkill. Returns the count of pids
 * that were successfully signaled.
 *
 * Pre-fix docstring claimed a Windows-specific
 * `taskkill /F` branch that didn't exist in the implementation.
 *
 * Caller's responsibility to handle the root pid separately (which
 * is typically already being shutdown via `client.disconnect()` →
 * `transport.close()` in `McpClient`).
 */
export declare function sigtermPids(pids: readonly number[]): number;
