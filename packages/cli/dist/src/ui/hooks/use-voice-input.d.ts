/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { HistoryItemWithoutId } from '../types.js';
import type { VoiceStreamSession } from '../voice/voice-stream-session.js';
import type { Key } from './useKeypress.js';
export interface RecordedVoiceAudio {
    data: Uint8Array;
    mimeType: string;
}
export interface VoiceRecorderStartOptions {
    /** Enable amplitude-based auto-stop after sustained silence (tap mode). */
    silenceDetection?: boolean;
    /** Invoked if the recorder stops itself (silence detected) before stop(). */
    onAutoStop?: () => void;
}
export type MicrophonePermission = 'granted' | 'denied' | 'prompt' | 'unknown';
export interface VoiceRecorder {
    start: (options?: VoiceRecorderStartOptions) => Promise<void> | void;
    stop: () => Promise<RecordedVoiceAudio>;
    /** Optional: pre-load the backend so the first start() isn't cold. */
    warmup?: () => void | Promise<void>;
    /** Optional: query OS microphone permission (macOS TCC). */
    microphoneStatus?: () => Promise<MicrophonePermission>;
    /** Optional (streaming): return & clear PCM captured since the last call. */
    drain?: () => Uint8Array;
    /** Optional: whether this recorder can provide streaming PCM chunks. */
    supportsStreaming?: () => boolean;
    /** Optional: recent input level 0..1 for the waveform. */
    audioLevel?: () => number;
}
export type VoiceTranscriber = (audio: RecordedVoiceAudio, context: {
    voiceModel: string;
}) => Promise<string>;
export type VoiceInputStatus = 'idle' | 'recording' | 'transcribing' | 'refining';
/** hold = hold-to-talk (release stops, dictation only). tap = tap to start, tap/silence to stop+submit. */
export type VoiceInputMode = 'hold' | 'tap';
interface UseVoiceInputArgs {
    enabled: boolean;
    mode?: VoiceInputMode;
    voiceModel?: string;
    buffer: Pick<TextBuffer, 'text' | 'insert'>;
    addItem?: (item: HistoryItemWithoutId, timestamp: number) => void;
    createRecorder: () => VoiceRecorder;
    transcribe: VoiceTranscriber;
    /**
     * Optional cleanup pass applied to the final transcript before it is inserted
     * (and, in tap mode, submitted). Runs for both batch and streaming models.
     * Must resolve to usable text even on failure — the hook inserts whatever it
     * returns. The signal is aborted if the recording is cancelled mid-refine.
     */
    refine?: (raw: string, signal: AbortSignal) => Promise<string>;
    /**
     * Called after a tap-mode transcript is inserted, to submit the prompt.
     * Receives the resulting prompt text — buffer.insert dispatches async, so the
     * submit handler must not read it back from buffer.text synchronously.
     */
    onSubmit?: (text: string) => void;
    /** Pre-load the recorder backend when voice turns on (avoids cold-start race). */
    warmup?: () => void | Promise<void>;
    /** Enable live streaming transcription (requires openStream + a drain-capable recorder). */
    streaming?: boolean;
    /** Open a streaming session; the hook pumps drained PCM into it while recording. */
    openStream?: (callbacks: {
        onInterim: (text: string) => void;
        onError?: (error: Error) => void;
    }) => Promise<VoiceStreamSession>;
}
interface UseVoiceInputReturn {
    status: VoiceInputStatus;
    /** Live partial transcript during streaming (empty otherwise). */
    interimText: string;
    /** Recent input level 0..1 during recording (for a waveform). */
    audioLevel: number;
    handleKeypress: (key: Key) => boolean;
}
export declare function useVoiceInput({ enabled, mode, voiceModel, buffer, addItem, createRecorder, transcribe, refine, onSubmit, warmup, streaming, openStream, }: UseVoiceInputArgs): UseVoiceInputReturn;
export {};
