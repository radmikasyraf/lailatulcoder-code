/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { LIVE_HOST_PROTOCOL_VERSION } from './types.js';
export declare const LIVE_DISCOVERY_RELATIVE_PATH: string;
export interface LiveDiscoveryRecord {
    url: string;
    token?: string;
    protocolVersion: typeof LIVE_HOST_PROTOCOL_VERSION;
    pid: number;
    instanceNonce: string;
}
export interface LiveDiscoveryOwner {
    pid: number;
    instanceNonce: string;
}
export declare class LiveDiscoveryOwnerActiveError extends Error {
    readonly ownerPid: number;
    constructor(ownerPid: number);
}
export declare class LiveDiscoveryStateError extends Error {
    constructor(cause?: unknown);
}
export declare class LiveDiscoveryPublicationError extends Error {
    readonly published = true;
    constructor(cause: unknown);
}
export declare function getStableLiveDiscoveryBaseDir(homeDirectory?: string): string;
export declare function getLiveDiscoveryPath(runtimeBaseDir: string): string;
export declare function handoffLiveDiscoveryOwner(runtimeBaseDir: string, owner: LiveDiscoveryOwner, commitOwner: () => Promise<void>, options?: {
    isProcessAlive?: (pid: number) => boolean;
    wait?: (milliseconds: number) => Promise<void>;
    handoffGraceMs?: number;
    waitForHandoffGrace?: boolean;
}): Promise<{
    reclaimed: boolean;
}>;
export declare function writeLiveDiscoveryFile(runtimeBaseDir: string, record: LiveDiscoveryRecord, options?: {
    isProcessAlive?: (pid: number) => boolean;
}): Promise<string>;
export declare function removeLiveDiscoveryFile(runtimeBaseDir: string, owner: LiveDiscoveryOwner): Promise<boolean>;
