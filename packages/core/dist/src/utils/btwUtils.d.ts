/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CacheSafeParams } from './forkedAgent.js';
import type { Config } from '../config/config.js';
/** Maximum input length (chars) accepted by btw routes and slash command. */
export declare const BTW_MAX_INPUT_LENGTH = 4096;
export declare function buildBtwPrompt(question: string): string;
export declare function buildBtwCacheSafeParams(config: Config): CacheSafeParams | null;
