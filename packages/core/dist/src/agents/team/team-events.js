/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Typed event emitter for team coordination events.
 *
 * Follows the ArenaEventEmitter pattern: typed wrapper around
 * EventEmitter with a discriminated event map.
 */
import { EventEmitter } from 'events';
// ─── Event Types ────────────────────────────────────────────
export var TeamEventType;
(function (TeamEventType) {
    /** A teammate has been spawned and is ready. */
    TeamEventType["TEAMMATE_JOINED"] = "teammate_joined";
    /** A teammate transitioned to IDLE. */
    TeamEventType["TEAMMATE_IDLE"] = "teammate_idle";
    /** A teammate's status changed. */
    TeamEventType["TEAMMATE_STATUS_CHANGE"] = "teammate_status_change";
    /** A teammate has exited (terminal status). */
    TeamEventType["TEAMMATE_EXITED"] = "teammate_exited";
    /** A message was sent to a teammate. */
    TeamEventType["MESSAGE_SENT"] = "message_sent";
    /** A task was auto-claimed by an idle teammate. */
    TeamEventType["TASK_AUTO_CLAIMED"] = "task_auto_claimed";
    /** All teammates have reached terminal status. */
    TeamEventType["ALL_TEAMMATES_TERMINATED"] = "all_teammates_terminated";
    /** A teammate tool approval could not be forwarded via the
     *  in-memory bridge (headless). The payload carries enough
     *  context for a CLI-level handler to resolve the approval
     *  through the session's own permission channel. */
    TeamEventType["TEAMMATE_APPROVAL_REQUEST"] = "teammate_approval_request";
})(TeamEventType || (TeamEventType = {}));
// ─── Event Emitter ──────────────────────────────────────────
export class TeamEventEmitter {
    ee = new EventEmitter();
    on(event, listener) {
        this.ee.on(event, listener);
    }
    off(event, listener) {
        this.ee.off(event, listener);
    }
    emit(event, payload) {
        this.ee.emit(event, payload);
    }
    once(event, listener) {
        this.ee.once(event, listener);
    }
    removeAllListeners() {
        this.ee.removeAllListeners();
    }
}
//# sourceMappingURL=team-events.js.map