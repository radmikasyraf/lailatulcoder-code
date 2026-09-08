/**
 * Per-project lock for the durable cron scheduler. Ensures only one
 * session fires file-backed tasks when multiple sessions share a project.
 *
 * Lock file: `~/.qwen/tmp/<project-hash>/scheduled_tasks.lock` (per-machine
 * runtime state — kept out of the working tree, next to the tasks file).
 * Content: `{ "pid": <number>, "sessionId": "<string>", "lockId": "<string>" }`
 *
 * `lockId` distinguishes lock holders that share a pid and sessionId —
 * e.g. a session reload creates a fresh scheduler for the same session
 * while the old scheduler's release is still in flight. Without it the
 * new holder would adopt the old lock file moments before its unlink
 * lands, and believe it owns a lock that no longer exists.
 *
 * Acquisition: exclusive create (`wx`). An existing lock is honored while
 * its PID is alive; a dead or malformed lock is atomically renamed aside
 * before re-creating. The renamed file is then verified to really be the
 * stale lock that was inspected — a racing contender may already have
 * cleared it and created a fresh lock at the same path, which must be
 * restored, not discarded.
 * Release: delete the file (best-effort on exit).
 */
export declare function getLockFilePath(projectRoot: string): string;
/**
 * Try to acquire the scheduler lock. Returns true if this session now
 * owns it. Safe to call repeatedly — re-acquiring an already-held lock
 * is a no-op that returns true.
 */
export declare function tryAcquireLock(projectRoot: string, sessionId: string, lockId?: string): Promise<boolean>;
/**
 * Release the lock. Only deletes if we own it. Best-effort — errors
 * are swallowed since this is typically called on shutdown.
 */
export declare function releaseLock(projectRoot: string, sessionId: string, lockId?: string): Promise<void>;
