/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ComputerUseClient } from './client.js';
export interface BootstrapContext {
    signal: AbortSignal;
    updateOutput?: (output: string) => void;
    /** Treat the first-use install as pre-approved (YOLO / AUTO_EDIT / AUTO). */
    autoApproveInstall?: boolean;
}
/**
 * Result of a permission probe:
 *  - 'ok'              both grants present
 *  - 'accessibility'   Accessibility missing
 *  - 'screenRecording' Accessibility present, Screen Recording missing
 *  - 'unknown'         couldn't read status (no daemon yet / restarting)
 */
export type PermissionProbeResult = 'ok' | 'accessibility' | 'screenRecording' | 'unknown';
/** A running status daemon we can tear down. */
export interface StatusDaemon {
    kill: () => void;
}
export interface BootstrapDeps {
    homeDir: string;
    approvalKey: string;
    platform: NodeJS.Platform;
    promptInstallApproval: (key: string) => Promise<boolean>;
    install: (onProgress?: (m: string) => void) => Promise<string>;
    /**
     * Launch a status-only daemon (`serve --no-permissions-gate` via
     * `open -a CuaDriver`) so `permissions status` returns per-permission
     * booleans even before any grant. Returns a handle to tear it down.
     */
    startStatusDaemon: () => StatusDaemon;
    /** Read current TCC status (`permissions status --json`). */
    probePermissions: () => Promise<PermissionProbeResult>;
    /** Open the System Settings pane for one permission so the user can grant it. */
    openPermissionPane: (kind: 'accessibility' | 'screenRecording') => void;
    /** Poll interval. Default 5000ms. */
    pollIntervalMs?: number;
    /** Total poll timeout. Default 10 min. */
    pollTimeoutMs?: number;
}
/**
 * Parse `cua-driver permissions status --json` into a probe result.
 * Shape: `{ accessibility: bool, screen_recording: bool, ... }`.
 */
export declare function parsePermissionsStatus(json: string): PermissionProbeResult;
/** Probe via the window-free `permissions status --json` CLI (non-blocking). */
export declare function probePermissionsViaStatus(): Promise<PermissionProbeResult>;
/**
 * Launch the status-only daemon. `open -a CuaDriver` gives it the
 * com.trycua.driver TCC identity; `--no-permissions-gate` makes it serve
 * immediately so status reads work before grants land. Kills any prior daemon
 * first so there is exactly one.
 */
export declare function startStatusDaemonProcess(): StatusDaemon;
/** Open the System Settings privacy pane for a permission. */
export declare function openPermissionPaneProcess(kind: 'accessibility' | 'screenRecording'): void;
export declare function runBootstrap(client: ComputerUseClient, ctx: BootstrapContext, depsOverride?: Partial<BootstrapDeps>): Promise<void>;
