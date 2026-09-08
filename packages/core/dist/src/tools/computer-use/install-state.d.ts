/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface InstallState {
    /**
     * The cua-driver approval key the user accepted (e.g. "cua-driver-rs@0.5.2",
     * from `approvalKey()`). Field name is retained for back-compat with existing
     * on-disk `installed.json`; it no longer holds an npm package spec.
     */
    approvedPackageSpec: string;
    /** ISO 8601 UTC timestamp of approval. */
    approvedAtIso: string;
}
/**
 * Path to the install-state file. Exported for tests so they can
 * point at a temp directory.
 */
export declare function installStatePathFor(home?: string): string;
export declare function loadInstallState(home?: string): Promise<InstallState | undefined>;
export declare function saveInstallState(home: string | undefined, state: InstallState): Promise<void>;
/**
 * True iff the persisted state's package spec exactly matches the one
 * we're about to install. Different specs (version pin bumps) require
 * re-approval, since the user may have approved an older / smaller /
 * different-license version.
 */
export declare function isPackageSpecApproved(home: string | undefined, packageSpec: string): Promise<boolean>;
