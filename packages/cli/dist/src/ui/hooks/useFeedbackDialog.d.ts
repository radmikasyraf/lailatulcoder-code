import { type Config } from '@lailatul-coder/lailatul-coder-core';
import { StreamingState, type HistoryItem } from '../types.js';
import { type LoadedSettings } from '../../config/settings.js';
import type { SessionStatsState } from '../contexts/SessionContext.js';
export interface UseFeedbackDialogProps {
    config: Config;
    settings: LoadedSettings;
    streamingState: StreamingState;
    history: HistoryItem[];
    sessionStats: SessionStatsState;
}
export declare const useFeedbackDialog: ({ config, settings, streamingState, history, sessionStats, }: UseFeedbackDialogProps) => {
    isFeedbackDialogOpen: boolean;
    openFeedbackDialog: () => void;
    closeFeedbackDialog: () => void;
    temporaryCloseFeedbackDialog: () => void;
    submitFeedback: (rating: number) => void;
};
