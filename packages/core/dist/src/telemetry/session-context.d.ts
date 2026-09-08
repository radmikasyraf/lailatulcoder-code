/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Context } from '@opentelemetry/api';
export declare function setSessionContext(ctx: Context | undefined, sessionId?: string): void;
export declare function getSessionContext(): Context | undefined;
/**
 * Returns the most recent session ID passed to setSessionContext.
 * This remains the final compatibility fallback for single-session telemetry
 * paths that have no explicit owner or scoped context.
 */
export declare function getCurrentSessionId(): string | undefined;
export declare function setSessionIdOnContext(ctx: Context, sessionId: string | undefined): Context;
export declare function getSessionIdFromContext(ctx: Context): string | undefined;
