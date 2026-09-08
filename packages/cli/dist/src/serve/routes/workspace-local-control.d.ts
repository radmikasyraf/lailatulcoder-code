/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Application, Request, RequestHandler } from 'express';
import { type LocalControlService } from '../local-control/service.js';
export interface RegisterWorkspaceLocalControlRoutesDeps {
    service: LocalControlService;
    mutate: (opts?: {
        strict?: boolean;
    }) => RequestHandler;
    safeBody: (req: Request) => Record<string, unknown>;
    isDaemonDraining?: () => boolean;
    webShellAvailable?: boolean;
    /** The daemon's primary bind hostname (runtime enable precondition). */
    primaryBindHostname?: string;
}
export declare function registerWorkspaceLocalControlRoutes(app: Application, deps: RegisterWorkspaceLocalControlRoutesDeps): void;
