/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const LIVE_SESSION_SOURCE_PREFIX = "realtime_voice:";
export declare const STANDALONE_SESSION_SOURCE_TYPE = "standalone";
export interface LiveSessionCreationMetadata {
    parentSessionId?: string;
    sourceType?: string;
    sourceId?: string;
}
export interface ConversationSessionMetadataStore {
    getSessionLocation(sessionId: string): Promise<'active' | 'archived' | 'conflict' | undefined>;
    readCreationMetadataIfReadable(sessionId: string, state: 'active' | 'archived'): Promise<LiveSessionCreationMetadata | undefined>;
}
export type ConversationSessionKind = 'live' | 'standalone';
export interface ConversationSessionLineage {
    kind: ConversationSessionKind;
    persistence: 'explicit' | 'legacy';
}
export interface LoadableConversationSession {
    kind: ConversationSessionKind;
    persistence: 'explicit' | 'legacy';
    /**
     * Classification of the persisted parent, set only when this session has a
     * parent and that parent is still readable and classifies as top-level.
     * Undefined for a top-level session, and for an explicit standalone child
     * whose parent has been archived away or deleted: that child is
     * self-describing, so a parent it can no longer produce is not evidence
     * against it. Callers that require proven lineage must check this rather
     * than infer it from `kind`.
     */
    parentSource?: ConversationSessionLineage;
    metadata: LiveSessionCreationMetadata;
}
export declare function isReservedLiveSessionSource(source: {
    sourceType?: string;
    sourceId?: string;
}): boolean;
export declare function isCompatibleLiveSessionSource(source: {
    sourceType?: string;
    sourceId?: string;
}): boolean;
export declare function isReservedStandaloneSessionSource(source: {
    sourceType?: string;
}): boolean;
export declare function classifyTopLevelConversationSource(metadata: LiveSessionCreationMetadata): LoadableConversationSession | undefined;
export declare function readLoadableConversationSession(sessionId: string, store: ConversationSessionMetadataStore): Promise<LoadableConversationSession | undefined>;
export declare function readLoadableLiveConversationMetadata(sessionId: string, store: ConversationSessionMetadataStore): Promise<LiveSessionCreationMetadata | undefined>;
