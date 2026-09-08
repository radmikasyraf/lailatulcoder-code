/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Options for writeWithBackup function.
 */
export interface WriteWithBackupOptions {
    /** Suffix for backup file (default: '.orig') */
    backupSuffix?: string;
    /** File encoding (default: 'utf-8') */
    encoding?: BufferEncoding;
}
/**
 * Safely writes content to a file with backup protection.
 *
 * This function ensures data safety by:
 * 1. Writing content to a temporary file first
 * 2. Backing up the existing target file (if any)
 * 3. Renaming the temporary file to the target path
 *
 * If any step fails, an error is thrown and no partial changes are left on disk.
 * The backup acts as an in-flight safety net: if the final rename fails the
 * original is restored from it. On success the backup is removed so it does not
 * linger next to the target file (which would pollute the user's project).
 *
 * Note: This is not 100% atomic but provides good protection. In the worst case
 * (a crash between the backup rename and the final rename), a .orig file remains
 * holding the last good content and can be manually restored.
 *
 * @param targetPath - The path to write to
 * @param content - The content to write
 * @param options - Optional configuration
 * @throws Error if any step of the write process fails
 *
 * @example
 * ```typescript
 * await writeWithBackup('/path/to/settings.json', JSON.stringify(settings, null, 2));
 * // On success only /path/to/settings.json exists; the .orig backup is cleaned up.
 * ```
 */
export declare function writeWithBackup(targetPath: string, content: string, options?: WriteWithBackupOptions): Promise<void>;
/**
 * Synchronous version of writeWithBackup.
 *
 * @param targetPath - The path to write to
 * @param content - The content to write
 * @param options - Optional configuration
 * @throws Error if any step of the write process fails
 */
export declare function writeWithBackupSync(targetPath: string, content: string, options?: WriteWithBackupOptions): void;
