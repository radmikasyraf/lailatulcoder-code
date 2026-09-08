/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { AgentViewWorkerControlEvent, AgentViewSessionState, AgentViewWorkerEvent } from './protocol.js';
export declare const QWEN_AGENT_VIEW_WORKER = "QWEN_AGENT_VIEW_WORKER";
export declare const QWEN_AGENT_VIEW_SESSION_ID = "QWEN_AGENT_VIEW_SESSION_ID";
export declare const QWEN_AGENT_VIEW_SIDEBAND = "QWEN_AGENT_VIEW_SIDEBAND";
export declare const QWEN_AGENT_VIEW_TOKEN = "QWEN_AGENT_VIEW_TOKEN";
export declare const QWEN_AGENT_VIEW_ACTIVE_CWD = "QWEN_AGENT_VIEW_ACTIVE_CWD";
export declare const AGENT_VIEW_WORKER_ENV_KEYS: readonly ["QWEN_AGENT_VIEW_WORKER", "QWEN_AGENT_VIEW_SESSION_ID", "QWEN_AGENT_VIEW_SIDEBAND", "QWEN_AGENT_VIEW_TOKEN", "QWEN_AGENT_VIEW_ACTIVE_CWD"];
export type AgentViewWorkerEnvKey = (typeof AGENT_VIEW_WORKER_ENV_KEYS)[number];
export interface AgentViewWorkerSidebandEnv {
    sessionId: string;
    sidebandEndpoint: string;
    token: string;
    activeCwd: string;
}
type AgentViewWorkerEventWithoutSession = Omit<Extract<AgentViewWorkerEvent, {
    type: 'ready';
}>, 'sessionId'> | Omit<Extract<AgentViewWorkerEvent, {
    type: 'heartbeat';
}>, 'sessionId'> | Omit<Extract<AgentViewWorkerEvent, {
    type: 'detach';
}>, 'sessionId'> | Omit<Extract<AgentViewWorkerEvent, {
    type: 'state';
}>, 'sessionId'>;
export interface AgentViewWorkerStateReport {
    sessionState: AgentViewSessionState;
    cwd?: string;
    summary?: string;
    waitingFor?: string;
    lastResult?: string;
}
export interface AgentViewWorkerHeartbeat {
    dispose(): void;
}
export declare function createAgentViewWorkerSidebandEnv(config: AgentViewWorkerSidebandEnv): Record<AgentViewWorkerEnvKey, string>;
export declare function isAgentViewWorkerEnv(env?: NodeJS.ProcessEnv): boolean;
export declare function readAgentViewWorkerSidebandEnv(env?: NodeJS.ProcessEnv): AgentViewWorkerSidebandEnv | undefined;
export declare function sendAgentViewWorkerEvent(event: AgentViewWorkerEventWithoutSession, env?: NodeJS.ProcessEnv): Promise<unknown>;
export declare function readAgentViewWorkerControlEvents(env?: NodeJS.ProcessEnv): Promise<AgentViewWorkerControlEvent[]>;
export declare function reportAgentViewWorkerState(report: AgentViewWorkerStateReport, env?: NodeJS.ProcessEnv): Promise<void>;
export declare function startAgentViewWorkerHeartbeat(env?: NodeJS.ProcessEnv, intervalMs?: number): AgentViewWorkerHeartbeat | undefined;
export declare function resetAgentViewWorkerStateReportForTests(): void;
export {};
