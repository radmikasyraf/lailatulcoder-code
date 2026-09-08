/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { TeamFile, TeamMember } from './types.js';
/**
 * Absolute path to the teams root directory.
 * `~/.qwen/teams/`
 */
export declare function getTeamsRootDir(): string;
/**
 * Absolute path to a specific team's directory.
 * `~/.qwen/teams/{teamName}/`
 */
export declare function getTeamDir(teamName: string): string;
/**
 * Absolute path to a team's config file.
 * `~/.qwen/teams/{teamName}/config.json`
 */
export declare function getTeamFilePath(teamName: string): string;
/**
 * Absolute path to a team's inboxes directory.
 * `~/.qwen/teams/{teamName}/inboxes/`
 */
export declare function getInboxesDir(teamName: string): string;
/**
 * Absolute path to the tasks directory for a team.
 * `~/.qwen/tasks/{teamName}/`
 */
export declare function getTasksDir(teamName: string): string;
/**
 * Sanitize a team or agent name for use as a directory/file name.
 * Lowercases, replaces non-alphanumeric (except hyphens) with
 * hyphens, collapses consecutive hyphens, and trims leading/
 * trailing hyphens.
 */
export declare function sanitizeName(name: string): string;
/**
 * Format an agent ID from a name and team name.
 * Convention: "name@teamName".
 */
export declare function formatAgentId(name: string, teamName: string): string;
/**
 * Validate and return a sanitized teammate name. Throws if the
 * name is empty, reserved, or collides with an existing member —
 * the caller (Agent tool) requires `name` to be explicit, so a
 * collision is a model error worth surfacing rather than auto-
 * suffixing silently into a teammate the model didn't ask for.
 */
export declare function generateUniqueTeammateName(baseName: string, existingMembers: readonly TeamMember[]): string;
/**
 * Assign the next available color to a teammate.
 * Picks the first color from TEAMMATE_COLORS not already used
 * by an existing member. Wraps around if all colors are taken.
 */
export declare function assignTeammateColor(existingMembers: readonly TeamMember[]): string;
/**
 * Clear all teammate colors from a team file's members.
 * Returns a new members array (does not mutate).
 */
export declare function clearTeammateColors(members: readonly TeamMember[]): TeamMember[];
/**
 * Set a member's `isActive` flag.
 * Returns a new members array (does not mutate).
 */
export declare function setMemberActive(members: readonly TeamMember[], agentId: string, isActive: boolean): TeamMember[];
/**
 * Find a member by agent ID.
 */
export declare function findMemberById(members: readonly TeamMember[], agentId: string): TeamMember | undefined;
/**
 * Find a member by name. Stored member names are already sanitized
 * (see {@link sanitizeName}), so the lookup name is sanitized too —
 * `"QA Tester"` matches the stored `"qa-tester"`.
 */
export declare function findMemberByName(members: readonly TeamMember[], name: string): TeamMember | undefined;
/**
 * Classify a teammate's free-text reply to a shutdown request.
 *
 * The leader asks the teammate to reply with `shutdown_approved` or
 * `shutdown_rejected: <reason>`. A compliant reply leads with the
 * token, so match only at the start (after leading whitespace) — never
 * anywhere in the body. That anchoring is what stops a teammate that
 * merely *mentions* the token mid-report (e.g. while reviewing
 * shutdown-related code) from being read as an approval and aborted,
 * while still accepting the verbose `shutdown_approved, work finished`
 * form that an exact-string match would miss.
 *
 * Returns the structured response type, or undefined when the reply is
 * not a shutdown response.
 */
export declare function classifyShutdownResponse(message: string): 'shutdown_approved' | 'shutdown_rejected' | undefined;
/**
 * Read a team file from disk.
 * Returns undefined if the file does not exist.
 */
export declare function readTeamFile(teamName: string): Promise<TeamFile | undefined>;
/**
 * Write a team file to disk. Creates parent directories if needed.
 *
 * Used for updates after the team exists. For initial creation,
 * prefer `createTeamFile` which refuses to clobber an existing
 * file (cross-session safety).
 */
export declare function writeTeamFile(teamName: string, teamFile: TeamFile): Promise<void>;
/**
 * Atomically create a team file. Throws ENOENT-equivalent
 * `EEXIST` if a different lailatul-coder session already owns the
 * team name — `team_create`'s in-process guard only checks the
 * current Config, so without this two sessions opening the same
 * team name would silently clobber each other's state.
 */
export declare function createTeamFile(teamName: string, teamFile: TeamFile): Promise<void>;
/**
 * Reclaim a stale team so its name can be reused.
 *
 * Nothing deletes team dirs on normal session exit (only an explicit
 * `team_delete` does), so `team_create`'s `wx`-exclusive create would
 * otherwise wedge the name forever after a Ctrl+C, a completed
 * headless run, or a crash. A team is stale when its recorded
 * `leadPid` is no longer running — or IS this process (the caller can
 * only be creating a new team because it no longer has a manager for
 * the old one). Returns true after deleting the stale team's dirs.
 *
 * Conservative on ambiguity: an unreadable/corrupt team file or a
 * pre-`leadPid` file can't prove its owner is gone, so it is left
 * for manual recovery.
 */
export declare function tryReclaimStaleTeam(teamName: string): Promise<boolean>;
/**
 * Delete an entire team directory and its associated task
 * directory. Silently ignores missing directories.
 */
export declare function deleteTeamDirs(teamName: string): Promise<void>;
/**
 * List all team names (directory names under ~/.qwen/teams/).
 * Returns an empty array if the teams directory doesn't exist.
 */
export declare function listTeamNames(): Promise<string[]>;
