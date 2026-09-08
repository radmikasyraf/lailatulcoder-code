/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { type ToolResultBoundaryArtifact } from '@lailatul-coder/lailatul-coder-core';
import type { CLIMessage } from '../nonInteractive/types.js';
export declare function associateAcpToolResultArtifact(update: SessionUpdate, artifact: ToolResultBoundaryArtifact): void;
export declare function observeAcpToolResultProjection(input: SessionUpdate, output: SessionUpdate, sessionId: string, wireUpdate?: SessionUpdate): void;
export declare function observeAcpToolResultWire(message: unknown, payloadUtf8Bytes: number): void;
export declare function observeHeadlessToolResultProjection(message: CLIMessage, inputContent: string, outputContent: string, toolCallId: string, artifact: ToolResultBoundaryArtifact): void;
export declare function observeHeadlessToolResultWire(message: CLIMessage, frame: string): void;
export declare function observeHeadlessJsonToolResultWire(messages: readonly CLIMessage[], frame: string): void;
