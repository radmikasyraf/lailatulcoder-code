/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type IQwenOAuth2Client } from '@lailatul-coder/lailatul-coder-core';
import { type BrandedSecret, type DeviceFlowPollResult, type DeviceFlowProvider, type DeviceFlowProviderId, type DeviceFlowStartResult } from './device-flow.js';
/**
 * Qwen-OAuth implementation of `DeviceFlowProvider` for `qwen serve`.
 *
 * Uses the lower-level `QwenOAuth2Client` primitives (`requestDeviceAuthorization`
 * / `pollDeviceToken`) directly rather than the high-level
 * `authWithQwenDeviceFlow` because that helper invokes `open(url)` to launch
 * a browser on the daemon host — only the SDK/user side may decide to open
 * a URL.
 */
export declare class QwenOAuthDeviceFlowProvider implements DeviceFlowProvider {
    readonly providerId: DeviceFlowProviderId;
    private readonly client;
    constructor(client?: IQwenOAuth2Client);
    start(opts: {
        signal: AbortSignal;
    }): Promise<DeviceFlowStartResult>;
    poll(state: {
        deviceCode: BrandedSecret<string>;
        pkceVerifier?: BrandedSecret<string>;
    }, opts: {
        signal: AbortSignal;
    }): Promise<DeviceFlowPollResult>;
}
