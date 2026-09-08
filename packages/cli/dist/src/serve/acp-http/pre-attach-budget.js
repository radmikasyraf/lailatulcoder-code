/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
export const ACP_PRE_ATTACH_MAX_FRAMES_PER_STREAM = 256;
export const ACP_PRE_ATTACH_MAX_FRAMES_PER_CONNECTION = 1024;
export const ACP_PRE_ATTACH_MAX_FRAMES_GLOBAL = 4096;
export const ACP_PRE_ATTACH_MAX_PAYLOAD_BYTES_PER_CONNECTION = 64 * 1024 * 1024;
export const ACP_PRE_ATTACH_MAX_PAYLOAD_BYTES_GLOBAL = 256 * 1024 * 1024;
export class AcpPreAttachBudget {
    limits;
    usedFrames = 0;
    usedBytes = 0;
    pendingDeliveryFrames = 0;
    highWaterFrames = 0;
    highWaterBytes = 0;
    guardFailures = 0;
    constructor(limits = {
        maxFrames: ACP_PRE_ATTACH_MAX_FRAMES_GLOBAL,
        maxBytes: ACP_PRE_ATTACH_MAX_PAYLOAD_BYTES_GLOBAL,
    }) {
        this.limits = limits;
    }
    tryReserve(bytes) {
        if (this.usedFrames >= this.limits.maxFrames ||
            bytes > this.limits.maxBytes - this.usedBytes) {
            this.guardFailures += 1;
            return undefined;
        }
        this.usedFrames += 1;
        this.usedBytes += bytes;
        this.highWaterFrames = Math.max(this.highWaterFrames, this.usedFrames);
        this.highWaterBytes = Math.max(this.highWaterBytes, this.usedBytes);
        let released = false;
        let pendingDelivery = false;
        return {
            markPendingDelivery: () => {
                if (released || pendingDelivery)
                    return;
                pendingDelivery = true;
                this.pendingDeliveryFrames += 1;
            },
            release: () => {
                if (released)
                    return;
                released = true;
                if (pendingDelivery)
                    this.pendingDeliveryFrames -= 1;
                this.usedFrames -= 1;
                this.usedBytes -= bytes;
            },
        };
    }
    recordGuardFailure() {
        this.guardFailures += 1;
    }
    snapshot() {
        return {
            usedFrames: this.usedFrames,
            usedBytes: this.usedBytes,
            pendingDeliveryFrames: this.pendingDeliveryFrames,
            highWaterFrames: this.highWaterFrames,
            highWaterBytes: this.highWaterBytes,
            guardFailures: this.guardFailures,
        };
    }
}
//# sourceMappingURL=pre-attach-budget.js.map