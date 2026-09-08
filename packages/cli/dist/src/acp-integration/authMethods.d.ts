/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from '@lailatul-coder/lailatul-coder-core';
import type { AuthMethod } from '@agentclientprotocol/sdk';
export declare function buildAuthMethods(): AuthMethod[];
export declare function pickAuthMethodsForAuthRequired(selectedType?: AuthType | string): AuthMethod[];
