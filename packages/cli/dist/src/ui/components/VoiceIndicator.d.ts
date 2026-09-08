/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { VoiceInputStatus } from '../hooks/use-voice-input.js';
interface VoiceIndicatorProps {
    status: VoiceInputStatus;
    /** Live partial transcript (streaming only). */
    interimText?: string;
    /** Recent input level 0..1. */
    audioLevel?: number;
}
/** Live voice dictation indicator: state, input-level meter, and partial text. */
export declare function VoiceIndicator({ status, interimText, audioLevel, }: VoiceIndicatorProps): React.JSX.Element | null;
export {};
