/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import type { DeviceAuthorizationData } from '@lailatul-coder/lailatul-coder-core';
interface QwenOAuthProgressProps {
    onTimeout: () => void;
    onCancel: () => void;
    deviceAuth?: DeviceAuthorizationData;
    authStatus?: 'idle' | 'polling' | 'success' | 'error' | 'timeout' | 'rate_limit';
    authMessage?: string | null;
}
export declare function QwenOAuthProgress({ onTimeout, onCancel, deviceAuth, authStatus, authMessage, }: QwenOAuthProgressProps): React.JSX.Element;
export {};
