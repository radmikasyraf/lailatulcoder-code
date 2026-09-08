/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Server } from 'node:http';
import type { Application } from 'express';
import type { ConversationRuntimeOwnership } from './conversations/conversation-runtime-ownership.js';
export interface ServeAppLifecycleBindingOptions {
    startupReady?: Promise<void>;
    drainHost?: () => Promise<void>;
}
export interface ServeAppLifecycle {
    bindServer(server: Server, options?: ServeAppLifecycleBindingOptions): void;
    close(options?: {
        timeoutMs?: number;
    }): Promise<void>;
}
export declare class ServeAppLifecycleController implements ServeAppLifecycle {
    private readonly admission;
    private server?;
    private startupReady;
    private listenerReady;
    private listenerClosed;
    private sealed;
    private closePending?;
    private ownership?;
    private appDrain?;
    private hostDrain?;
    private bootStarter?;
    private bootPending?;
    private bootStarted;
    bindServer(server: Server, options?: ServeAppLifecycleBindingOptions): void;
    close(options?: {
        timeoutMs?: number;
    }): Promise<void>;
    setOwnership(ownership: ConversationRuntimeOwnership): void;
    setAppDrain(drain: () => Promise<void>): void;
    setBootStarter(starter: () => Promise<void> | void): void;
    awaitBootAdmission(): Promise<void>;
    startBoot(starter?: (() => Promise<void> | void) | undefined): Promise<void>;
    getBootPromise(): Promise<void> | undefined;
    isBootStarted(): boolean;
    sealBoot(): void;
    private openAdmissionIfReady;
    private beginBoot;
    private seal;
    private closeOnce;
    private startDrain;
    private closeListener;
    private waitForClosingListener;
}
export declare function installServeAppLifecycle(app: Application, lifecycle?: ServeAppLifecycleController): ServeAppLifecycleController;
export declare function getServeAppLifecycle(app: Application): ServeAppLifecycle;
export declare function getServeAppLifecycleController(app: Application): ServeAppLifecycleController;
