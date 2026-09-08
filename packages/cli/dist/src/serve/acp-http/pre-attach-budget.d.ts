/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const ACP_PRE_ATTACH_MAX_FRAMES_PER_STREAM = 256;
export declare const ACP_PRE_ATTACH_MAX_FRAMES_PER_CONNECTION = 1024;
export declare const ACP_PRE_ATTACH_MAX_FRAMES_GLOBAL = 4096;
export declare const ACP_PRE_ATTACH_MAX_PAYLOAD_BYTES_PER_CONNECTION: number;
export declare const ACP_PRE_ATTACH_MAX_PAYLOAD_BYTES_GLOBAL: number;
export interface AcpPreAttachBudgetSnapshot {
    usedFrames: number;
    usedBytes: number;
    pendingDeliveryFrames: number;
    highWaterFrames: number;
    highWaterBytes: number;
    guardFailures: number;
}
export interface AcpPreAttachBudgetLimits {
    maxFrames: number;
    maxBytes: number;
}
export interface AcpPreAttachLease {
    markPendingDelivery(): void;
    release(): void;
}
export declare class AcpPreAttachBudget {
    readonly limits: AcpPreAttachBudgetLimits;
    private usedFrames;
    private usedBytes;
    private pendingDeliveryFrames;
    private highWaterFrames;
    private highWaterBytes;
    private guardFailures;
    constructor(limits?: AcpPreAttachBudgetLimits);
    tryReserve(bytes: number): AcpPreAttachLease | undefined;
    recordGuardFailure(): void;
    snapshot(): AcpPreAttachBudgetSnapshot;
}
