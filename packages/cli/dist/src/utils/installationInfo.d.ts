/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as childProcess from 'node:child_process';
export declare enum PackageManager {
    NPM = "npm",
    YARN = "yarn",
    PNPM = "pnpm",
    PNPX = "pnpx",
    BUN = "bun",
    BUNX = "bunx",
    HOMEBREW = "homebrew",
    STANDALONE = "standalone",
    NPX = "npx",
    UNKNOWN = "unknown"
}
export declare function getNpmCliPath(nodePath?: string, platform?: NodeJS.Platform): string;
export declare function resolveUpdateCommand(updateCommand: string, latestVersion: string): string;
export declare function formatUpdateInstructions(installationInfo: InstallationInfo, latestVersion: string): string[];
export interface InstallationInfo {
    packageManager: PackageManager;
    isGlobal: boolean;
    isStandalone?: boolean;
    standaloneDir?: string;
    updateCommand?: string;
    updateMessage?: string;
}
declare const execFileAsync: typeof childProcess.execFile.__promisify__;
/**
 * Best-effort lookup of the newest formula version visible in local Homebrew
 * metadata. While the homebrew-core formula lags the npm `latest` tag,
 * `brew upgrade` is a no-op, and an npm-based "update available"
 * notification would repeat on every startup with no way to clear it
 * (#9493). Callers use this to decide whether a Homebrew install can
 * actually be updated before notifying.
 *
 * Returns null when the version cannot be determined (brew missing,
 * timeout, unexpected output); callers keep the legacy notify behavior in
 * that case rather than silently hiding a real update.
 */
export declare function getHomebrewLatestVersion(formula?: string, run?: typeof execFileAsync): Promise<string | null>;
export declare function getInstallationInfo(projectRoot: string, isAutoUpdateEnabled: boolean): InstallationInfo;
export {};
