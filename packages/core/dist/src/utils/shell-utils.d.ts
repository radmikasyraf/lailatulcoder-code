/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import { type ExecFileOptions } from 'node:child_process';
/**
 * An identifier for the shell type.
 */
export type ShellType = 'cmd' | 'powershell' | 'bash';
/**
 * Defines the configuration required to execute a command string within a specific shell.
 */
export interface ShellConfiguration {
    /** The path or name of the shell executable (e.g., 'bash', 'cmd.exe'). */
    executable: string;
    /**
     * The arguments required by the shell to execute a subsequent string argument.
     */
    argsPrefix: string[];
    /** An identifier for the shell type. */
    shell: ShellType;
}
/**
 * Determines the appropriate shell configuration for the current platform.
 *
 * This ensures we can execute command strings predictably and securely across platforms
 * using the `spawn(executable, [...argsPrefix, commandString], { shell: false })` pattern.
 *
 * @returns The ShellConfiguration for the current environment.
 */
export declare function getShellConfiguration(): ShellConfiguration;
/**
 * Export the platform detection constant for use in process management (e.g., killing processes).
 */
export declare const isWindows: () => boolean;
/**
 * Escapes a string so that it can be safely used as a single argument
 * in a shell command, preventing command injection.
 *
 * @param arg The argument string to escape.
 * @param shell The type of shell the argument is for.
 * @returns The shell-escaped string.
 */
export declare function escapeShellArg(arg: string, shell: ShellType): string;
/**
 * Splits a shell command into a list of individual commands, respecting quotes.
 * This is used to separate chained commands (e.g., using &&, ||, ;).
 * @param command The shell command string to parse
 * @returns An array of individual command strings
 */
export declare function splitCommands(command: string): string[];
/**
 * Extracts the root command from a given shell command string.
 * Skips leading env var assignments (VAR=value) so that
 * `PYTHONPATH=/tmp python3 -c "..."` returns `python3`.
 */
export declare function getCommandRoot(command: string): string | undefined;
export declare function getCommandRoots(command: string): string[];
export declare function stripShellWrapper(command: string): string;
export declare const SHELL_SELF_KILL_REJECTION = "Blocked: this command may terminate the running lailatul-coder process because it targets all node/lailatul-coder processes. Use task_stop for managed background shells, or kill a specific PID instead.";
export declare function detectSelfKillCommand(command: string): boolean;
/**
 * Strip a single bare trailing `&` (bash background operator) from a
 * command string. Returns the input unchanged if the trailing form is
 * `&&` (logical AND), `\&` (escaped literal `&`), or there is no `&`
 * at the end at all.
 */
export declare function stripTrailingBackgroundAmp(command: string): string;
export declare function hasNonFinalTopLevelBackgroundOperator(command: string): boolean;
export interface NormalizedMonitorCommand {
    analysisCommand: string;
    safetyCommand: string;
    spawnCommand: string;
    strippedTrailingAmp: boolean;
}
export declare function normalizeMonitorCommand(command: string): NormalizedMonitorCommand;
export declare function hasUnsafeMonitorBackgroundOperator(command: string): boolean;
/**
 * Detects command substitution patterns in a shell command, following bash quoting rules:
 * - Single quotes ('): Everything literal, no substitution possible
 * - Double quotes ("): Command substitution with $() and backticks unless escaped with \
 * - No quotes: Command substitution with $(), <(), and backticks
 *
 * This function also understands heredocs:
 * - If a heredoc delimiter is quoted (e.g. `<<'EOF'`), bash will not perform
 *   expansions in the heredoc body, so substitution-like text is allowed.
 * - If a heredoc delimiter is unquoted (e.g. `<<EOF`), bash will perform
 *   expansions in the heredoc body, so command substitution is blocked there too.
 * @param command The shell command string to check
 * @returns true if command substitution would be executed by bash
 */
export declare function detectCommandSubstitution(command: string): boolean;
/**
 * User-facing warning emitted when a shell-tool invocation contains
 * command substitution (`$(...)`, backticks, `<(...)`, `>(...)`, or
 * `${parameter@P}`).
 * Shared across the shell-tool and monitor-tool confirmation paths so
 * the wording can't drift between sites — see #4386 review (round 3).
 */
export declare const COMMAND_SUBSTITUTION_WARNING = "Contains command substitution ($(...), backticks, <(...), >(...), or ${parameter@P}).";
/**
 * Single dual-check predicate: does the command contain shell command
 * substitution either as written (raw) or after `stripShellWrapper`
 * unwraps it? The raw check catches substitution that lives inside
 * leading env-prefix tokens (e.g. `FOO=$(curl evil) bash -c 'echo ok'`,
 * where stripShellWrapper discards the env-prefix AND unwraps to
 * `echo ok`, leaving no trace of the substitution). The stripped
 * check catches substitution inside the wrapper's quoted body
 * (e.g. `bash -c 'echo $(cat secret)'`, where the raw `$(` sits inside
 * outer single quotes and is invisible to a raw-only check).
 *
 * Used by `buildShellExecWarnings` (UI warning surface),
 * `shouldAuditSubstitutionBypass` (audit log gate), and the
 * pre-AST gates in `ShellToolInvocation.getDefaultPermission`,
 * `MonitorToolInvocation.getDefaultPermission`, and
 * `PermissionManager.resolveDefaultPermission`. Centralising the
 * dual-check here keeps detection semantics in lockstep across all
 * surfaces (a change here propagates to every consumer). See PR #4386
 * round 6 for the env-prefix wrapper regression that motivated this.
 */
export declare function hasShellSubstitution(rawCommand: string): boolean;
/**
 * Build the warnings array for a shell-like tool's exec confirmation.
 * Returns `undefined` when nothing to flag — callers should only assign
 * the `warnings` field when the result is truthy, mirroring the
 * existing `if (warnings.length > 0)` pattern at each call site.
 *
 * Delegates the detection logic to `hasShellSubstitution` so the
 * dual-check semantics stay in one place; the historical 2-arg
 * signature is kept for callers that already have both forms in scope.
 */
export declare function buildShellExecWarnings(strippedCommand: string, rawCommand: string): string[] | undefined;
/**
 * Checks a shell command against security policies and permission rules.
 *
 * Uses PermissionManager (via config.getPermissionManager()) to evaluate each
 * sub-command.  The function operates in two modes:
 *
 * 1.  **"Default Deny" Mode (sessionAllowlist is provided):** Used for
 *     user-defined scripts / custom commands. A command is only permitted if
 *     it is found in the allow rules OR the provided `sessionAllowlist`.
 *     Commands not explicitly allowed are treated as a soft denial.
 *
 * 2.  **"Default Allow" Mode (sessionAllowlist is NOT provided):** Used for
 *     direct tool invocations by the model. Commands with a 'deny' decision
 *     are hard-blocked; 'ask' requires confirmation; all others are allowed.
 *
 * @param command The shell command string to validate.
 * @param config The application configuration.
 * @param sessionAllowlist A session-level list of approved commands. Its
 *   presence activates "Default Deny" mode.
 * @returns An object detailing which commands are not allowed.
 */
export declare function checkCommandPermissions(command: string, config: Config, sessionAllowlist?: Set<string>): Promise<{
    allAllowed: boolean;
    disallowedCommands: string[];
    blockReason?: string;
    isHardDenial?: boolean;
}>;
/**
 * Executes a command with the given arguments without using a shell.
 *
 * This is a wrapper around Node.js's `execFile`, which spawns a process
 * directly without invoking a shell, making it safer than `exec`.
 * It's suitable for short-running commands with limited output.
 *
 * @param command The command to execute (e.g., 'git', 'osascript').
 * @param args Array of arguments to pass to the command.
 * @param options Optional spawn options including:
 *   - preserveOutputOnError: If false (default), rejects on error.
 *                           If true, resolves with output and error code.
 *   - Other standard spawn options (e.g., cwd, env).
 * @returns A promise that resolves with stdout, stderr strings, and exit code.
 * @throws Rejects with an error if the command fails (unless preserveOutputOnError is true).
 */
export declare function execCommand(command: string, args: string[], options?: {
    preserveOutputOnError?: boolean;
} & ExecFileOptions): Promise<{
    stdout: string;
    stderr: string;
    code: number;
}>;
/**
 * Resolves the path of a command in the system's PATH.
 * @param {string} command The command name (e.g., 'git', 'grep').
 * @returns {path: string | null; error?: Error} The path of the command, or null if it is not found and any error that occurred.
 */
export declare function resolveCommandPath(command: string): {
    path: string | null;
    error?: Error;
};
/**
 * Checks if a command is available in the system's PATH.
 * @param {string} command The command name (e.g., 'git', 'grep').
 * @returns {available: boolean; error?: Error} The availability of the command and any error that occurred.
 */
export declare function isCommandAvailable(command: string): {
    available: boolean;
    error?: Error;
};
export declare function isCommandAllowed(command: string, config: Config): Promise<{
    allowed: boolean;
    reason?: string;
}>;
export declare function isCommandNeedsPermission(command: string): {
    requiresPermission: boolean;
    reason?: string;
};
/**
 * Checks user arguments for potentially dangerous shell characters.
 * This is used to validate arguments before they are substituted into
 * shell command templates (e.g., $ARGUMENTS placeholder).
 *
 * Note: This does NOT remove outer quotes - it validates the raw input.
 * Use escapeShellArg() for safe shell argument escaping.
 *
 * @param args - The raw user arguments string
 * @returns Object with isSafe flag and list of dangerous patterns found
 */
export declare function checkArgumentSafety(args: string): {
    isSafe: boolean;
    dangerousPatterns: string[];
};
export declare function shouldDefaultToNodePty(): boolean;
