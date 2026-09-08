/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface InsightProgressPayload {
    insight_progress: {
        stage: string;
        progress: number;
        detail?: string;
    };
}
export interface InsightReadyPayload {
    insight_ready: {
        path: string;
    };
}
export interface InsightErrorPayload {
    insight_error: {
        error: string;
    };
}
export type ParsedInsightMessage = {
    type: 'insight_progress';
    stage: string;
    progress: number;
    detail?: string;
} | {
    type: 'insight_ready';
    path: string;
} | {
    type: 'insight_error';
    error: string;
};
export declare function encodeInsightProgressMessage(stage: string, progress: number, detail?: string): string;
export declare function encodeInsightReadyMessage(path: string): string;
export declare function encodeInsightErrorMessage(error: string): string;
export declare function parseInsightMessage(message: string): ParsedInsightMessage | null;
