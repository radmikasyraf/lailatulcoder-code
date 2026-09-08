/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/** Structured message types for Phase 1. */
export type MailboxMessageType = 'shutdown_request' | 'shutdown_approved' | 'shutdown_rejected' | 'plan_approval_request' | 'plan_approval_response' | 'task_assignment';
/**
 * A single mailbox message.
 */
export interface MailboxMessage {
    /** Sender agent name. */
    from: string;
    /** Message text content. */
    text: string;
    /** ISO 8601 timestamp. */
    timestamp: string;
    /** Whether the message has been read. */
    read: boolean;
    /** Structured message type. */
    type?: MailboxMessageType;
    /** Sender's assigned color for UI. */
    color?: string;
    /** 5–10 word preview for UI. */
    summary?: string;
}
/**
 * Evict the in-process inbox locks for a team. The lock map keys on
 * absolute inbox path and would otherwise retain a `Mutex` for every
 * inbox the process ever touched — a slow leak across many team
 * create/delete cycles in a long-lived daemon. All of a team's inbox
 * paths sit directly under its inboxes dir, so match on the parent.
 *
 * Best-effort: a teammate's late `writeMessage` racing team teardown
 * can re-create an entry afterwards, but the next same-name
 * `team_create` resets inboxes and evicts it again.
 *
 * Returns the number of locks evicted.
 */
export declare function disposeInboxLocks(teamName: string): number;
/**
 * Absolute path to an agent's inbox file.
 */
export declare function getInboxPath(teamName: string, agentName: string): string;
/**
 * Read all messages from an agent's inbox.
 * Returns an empty array if the inbox doesn't exist.
 *
 * Reads happen without a lock: writes go through a tmp-file +
 * `rename` (atomicWriteJSON), so a reader can race with a writer
 * but will always observe either the pre-write or post-write
 * file — never a partial one. This avoids paying lock-contention
 * cost on the hot 500ms leader poll.
 */
export declare function readInbox(teamName: string, agentName: string): Promise<MailboxMessage[]>;
/**
 * Write a message to an agent's inbox.
 * Creates the inbox file and parent directories if needed.
 * Uses file locking to prevent concurrent write corruption.
 *
 * Drops `read: true` entries older than `READ_RETENTION_MS` so
 * the file stays bounded under long-running teams. Unread
 * messages are never dropped — they're still owed to the
 * recipient.
 */
export declare function writeMessage(teamName: string, toAgentName: string, message: MailboxMessage): Promise<void>;
/**
 * Read and remove all unread messages from an inbox,
 * optionally filtered by type. Marks matched messages as read.
 */
export declare function consumeUnread(teamName: string, agentName: string, type?: MailboxMessageType): Promise<MailboxMessage[]>;
/**
 * Clear an agent's entire inbox (delete the file).
 */
export declare function clearInbox(teamName: string, agentName: string): Promise<void>;
/**
 * Clear all inboxes for a team (delete the inboxes directory).
 */
export declare function clearAllInboxes(teamName: string): Promise<void>;
/**
 * Send a structured control message to an agent's mailbox.
 */
export declare function sendStructuredMessage(teamName: string, toAgentName: string, opts: {
    from: string;
    type: MailboxMessageType;
    text: string;
    color?: string;
    summary?: string;
}): Promise<void>;
