/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export interface VoiceEnvironment {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    fileExists?: (path: string) => boolean;
}
/**
 * Returns a human-readable reason if voice dictation cannot work in this
 * environment, or undefined when it should be available.
 */
export declare function getVoiceUnavailableReason(environment?: VoiceEnvironment): string | undefined;
