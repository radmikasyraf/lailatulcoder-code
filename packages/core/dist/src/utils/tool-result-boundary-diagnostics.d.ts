/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PartListUnion } from '@google/genai';
import { type DebugLogger } from './debugLogger.js';
import type { ToolArtifactKind, ToolResultArtifactState, ToolResultBoundaryArtifact } from '../tools/tools.js';
export declare const TOOL_RESULT_BOUNDARY_EVENT_NAME = "lailatul-coder.tool_result.boundary";
export declare const TOOL_RESULT_BOUNDARY_JSON_BYTE_THRESHOLD = 65536;
export declare const TOOL_RESULT_BOUNDARY_LOG_LIMIT = 50;
export declare const TOOL_RESULT_BOUNDARY_LOG_WINDOW_MS = 60000;
export type ToolResultBoundaryStage = 'producer' | 'producer_input' | 'producer_output' | 'finalizer_input' | 'finalizer_output' | 'recorder_input' | 'recorder_output' | 'acp_projection_input' | 'acp_projection_output' | 'acp_wire' | 'headless_projection_input' | 'headless_projection_output' | 'headless_wire';
export type ToolResultRepresentation = 'model_text' | 'display' | 'acp_content' | 'acp_raw_output' | 'headless_content';
export type ToolResultBoundaryArtifactKind = ToolArtifactKind | 'unknown';
export interface ToolResultBoundaryValue {
    representation: ToolResultRepresentation;
    value: string;
}
export interface ToolResultBoundaryObservation {
    stage: ToolResultBoundaryStage;
    values: readonly ToolResultBoundaryValue[] | (() => readonly ToolResultBoundaryValue[]);
    mutated?: boolean | (() => boolean);
    artifacts?: readonly ToolResultBoundaryArtifact[];
    sessionId?: string;
    promptId?: string;
    toolCallId?: string;
    toolCallIds?: readonly string[];
    toolName?: string;
    wireUtf8Bytes?: number;
}
export interface ToolResultBoundaryObserverOptions {
    enabled?: () => boolean;
    hmacKey?: Uint8Array;
    logLimit?: number;
    logger?: Pick<DebugLogger, 'debug' | 'isEnabled'>;
    now?: () => number;
    thresholdBytes?: number;
    windowMs?: number;
}
export declare function isToolResultBoundaryDiagnosticsEnabled(): boolean;
export declare function toolResultArtifactState(persistedOutputFiles: readonly string[] | undefined): ToolResultArtifactState;
export declare function toolResultBoundaryArtifact(persistedOutputFiles: readonly string[] | undefined, artifacts: ReadonlyArray<{
    kind?: unknown;
}> | undefined): ToolResultBoundaryArtifact;
export declare function toolResultPartDiagnosticValues(value: PartListUnion | null | undefined): ToolResultBoundaryValue[];
export declare function createToolResultBoundaryObserver(options?: ToolResultBoundaryObserverOptions): (observation: ToolResultBoundaryObservation) => boolean;
export declare function observeToolResultBoundary(observation: ToolResultBoundaryObservation): boolean;
