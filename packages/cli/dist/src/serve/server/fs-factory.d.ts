/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BridgeEvent } from '@lailatul-coder/acp-bridge/eventBus';
import { type NewFileModePolicy, type WorkspaceFileSystemFactory } from '../fs/index.js';
import type { PathMutexRegistry } from '../fs/path-mutex-registry.js';
import type { WorkspaceGenerationGuard } from '../workspace-registry.js';
/**
 * Parse `QWEN_SERVE_NEW_FILE_MODE` into the workspace filesystem's
 * new-file mode policy.
 *
 * Accepted values (case-insensitive, surrounding whitespace ignored):
 *   - unset / empty / `owner` / `0600` → `'owner'` — new files are
 *     created owner-only `0600` regardless of the daemon umask (the
 *     default, preserving the long-standing fail-closed posture).
 *   - `system` → `'system'` — new files follow the standard POSIX
 *     `0o666 & ~umask` handling, so agent-created files honor the
 *     daemon process's umask (e.g. a systemd unit's `UMask=0002`)
 *     like any other process on the machine.
 *
 * Any other value is rejected with a stderr warning and falls back to
 * `'owner'` — a typo in a security-relevant knob must never silently
 * widen file visibility. Mode preservation for existing files is
 * unaffected by either policy.
 */
export declare function parseNewFileModePolicy(env?: NodeJS.ProcessEnv): NewFileModePolicy;
/**
 * Build a no-op fs-audit emitter that logs a warning every
 * `WARN_EVERY` dropped events. The default factory uses this so a
 * regression that silently strips audit events shows up in operator
 * logs instead of disappearing. `runQwenServe` replaces this with a
 * real per-session emit, so legitimate production traffic never hits
 * the warning.
 */
export declare function createDefaultFsAuditEmit(): (event: BridgeEvent) => void;
/**
 * Shared `WorkspaceFileSystemFactory` construction used by both
 * `runQwenServe` and `createServeApp`'s default bridge wiring.
 * Centralizes the "use the injected factory if provided, otherwise
 * build one with the given trust + audit-emit posture" logic.
 *
 * Trust is intentionally a **required** parameter — the two call
 * sites have different correct defaults:
 *   - `runQwenServe` defaults to `trusted: true`
 *   - `createServeApp` defaults to `trusted: false` (test-safe)
 */
export declare function resolveBridgeFsFactory(input: {
    boundWorkspaces: readonly string[];
    injected?: WorkspaceFileSystemFactory;
    trusted: boolean;
    emit?: (event: BridgeEvent) => void;
    customIgnoreFiles?: string[];
    pathLocks?: PathMutexRegistry;
    generationGuard?: Pick<WorkspaceGenerationGuard, 'assertOpen'>;
    /**
     * New-file mode policy for the default factory. Undefined reads
     * `QWEN_SERVE_NEW_FILE_MODE` (default `'owner'` = `0600`).
     */
    newFileMode?: NewFileModePolicy;
}): WorkspaceFileSystemFactory;
export declare function resolveBoundWorkspacesFromIdeEnv(primaryWorkspace: string, ideWorkspacePath?: string | undefined, includeWorkspace?: (workspace: string, index: number) => boolean): string[];
