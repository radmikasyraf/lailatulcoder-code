/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { VoiceRecorder } from '../hooks/use-voice-input.js';
interface VoiceRecorderOptions {
    createNativeRecorder?: () => VoiceRecorder;
    createArecordRecorder?: () => VoiceRecorder;
    createSoxRecorder?: () => VoiceRecorder;
    platform?: NodeJS.Platform;
}
export declare function createVoiceRecorder(options?: VoiceRecorderOptions): VoiceRecorder;
export {};
