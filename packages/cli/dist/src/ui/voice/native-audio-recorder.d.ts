/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { NativeAudioCaptureBackend } from '@lailatul-coder/audio-capture';
import type { VoiceRecorder } from '../hooks/use-voice-input.js';
interface NativeAudioRecorderOptions {
    loadBackend?: () => NativeAudioCaptureBackend | Promise<NativeAudioCaptureBackend>;
}
export declare function createNativeAudioRecorder(options?: NativeAudioRecorderOptions): VoiceRecorder;
export {};
