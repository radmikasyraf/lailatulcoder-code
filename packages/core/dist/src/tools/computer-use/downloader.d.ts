/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface InstallOptions {
    home: string;
    platform?: NodeJS.Platform;
    arch?: string;
    version?: string;
    env?: NodeJS.ProcessEnv;
    /** Progress hook for the bootstrap UI ("Downloading… (~Xs)"). */
    onProgress?: (message: string) => void;
    /** Injection point for tests; defaults to global fetch. */
    fetchImpl?: typeof fetch;
    /**
     * Injection point for unzipping Windows `.zip` assets; defaults to OS tools
     * (bsdtar, then PowerShell). Tests and non-bsdtar hosts can override it.
     */
    unzipImpl?: (zipPath: string, destDir: string) => Promise<void>;
}
/**
 * Parse a release `checksums.txt` body into a `{ filename -> sha256 }` map.
 * Each line is `<hex-sha256>␠␠<filename>` (sha256sum format).
 */
export declare function parseChecksums(body: string): Map<string, string>;
/** Returns the installed binary path if already present, else undefined. */
export declare function findInstalled(home: string, platform?: NodeJS.Platform, arch?: string, version?: string): Promise<string | undefined>;
/**
 * Ensure the pinned cua-driver binary is installed, downloading +
 * verifying + extracting it if necessary. Returns the binary path.
 * Idempotent: a no-op (fast stat) when already installed.
 */
export declare function ensureInstalled(opts: InstallOptions): Promise<string>;
