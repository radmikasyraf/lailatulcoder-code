/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part } from '@google/genai';
import { type GoalEvidenceCheckpointClaim, type GoalEvidenceProofKind, type GoalRecord, type GoalTerminalProposal, type GoalTurnPermit } from './goal-protocol.js';
export declare const GOAL_EVIDENCE_REFERENCE_LIMIT = 100;
export type GoalEvidenceProvenance = 'real_user' | 'assistant_output' | 'tool_result' | 'goal_checkpoint';
type GoalRecordProvenance = GoalEvidenceProvenance | 'goal_control' | 'goal_runtime' | 'system';
export interface GoalEvidenceRecord {
    uuid: string;
    type: 'user' | 'assistant' | 'tool_result' | 'system';
    subtype?: string;
    provenance?: GoalRecordProvenance;
    goalContext?: unknown;
    message?: {
        parts?: Part[];
    };
    systemPayload?: unknown;
}
export type { GoalEvidenceProofKind } from './goal-protocol.js';
export interface GoalEvidenceCatalogEntry {
    uuid: string;
    provenance: GoalEvidenceProvenance;
    turnId: string;
    preview: string;
    proofKind: GoalEvidenceProofKind;
}
export interface GoalEvidenceCatalog {
    entries: GoalEvidenceCatalogEntry[];
    lineageTurnIds: string[];
    truncated: boolean;
}
export interface ValidatedGoalEvidenceRecord extends GoalEvidenceCatalogEntry {
    content: string;
}
export interface ValidatedGoalEvidence {
    citedRecords: ValidatedGoalEvidenceRecord[];
}
export interface GoalEvidenceContext {
    records: readonly GoalEvidenceRecord[];
    goal: GoalRecord;
    permit: GoalTurnPermit;
}
export interface GoalEvidenceValidationInput extends GoalEvidenceContext {
    proposal: GoalTerminalProposal;
}
export interface GoalEvidenceCheckpointWindow {
    previousClaims: GoalEvidenceCheckpointClaim[];
    evidence: ValidatedGoalEvidenceRecord[];
    truncated: boolean;
    shouldCheckpoint: boolean;
}
export type EvidenceSourceUnavailableCode = 'cursor_unset' | 'cursor_not_found' | 'duplicate_record_uuid' | 'permit_goal_mismatch' | 'malformed_turn_context' | 'turn_reentry' | 'current_turn_not_tail';
export declare class EvidenceSourceUnavailableError extends Error {
    readonly code: EvidenceSourceUnavailableCode;
    constructor(code: EvidenceSourceUnavailableCode, message: string);
}
export type InvalidGoalEvidenceReferenceCode = 'no_evidence_references' | 'too_many_evidence_references' | 'duplicate_evidence_reference' | 'evidence_payload_too_large' | 'missing_reference' | 'pre_cursor_reference' | 'ineligible_reference' | 'reference_not_catalogued' | 'missing_goal_context' | 'wrong_goal_id' | 'wrong_revision' | 'wrong_turn_lineage' | 'catalog_truncated' | 'immediate_blocker_external_evidence_required' | 'immediate_blocker_newer_evidence_required' | 'repeated_blocker_turn_coverage';
export declare class InvalidGoalEvidenceReferenceError extends Error {
    readonly code: InvalidGoalEvidenceReferenceCode;
    readonly reference?: string | undefined;
    constructor(code: InvalidGoalEvidenceReferenceCode, message: string, reference?: string | undefined);
}
export interface GoalEvidenceRecordIndexHint {
    uuid: string;
    parsedGoalContext?: {
        goalId: string;
        revision: number;
        turnId: string;
    };
    claimedGoalId?: string;
    claimedRevision?: number;
    provenance?: GoalEvidenceProvenance;
    hasCatalogEligibleContent: boolean;
    hasRawEligibleContent: boolean;
    catalogEntryBytes?: number;
}
export declare class GoalEvidenceRecordIndexAccumulator {
    private readonly uuid;
    private readonly parsedGoalContext?;
    private readonly claimedGoalId?;
    private readonly claimedRevision?;
    private readonly provenance?;
    private readonly hasObjectSystemPayload;
    private readonly displayText?;
    private readonly hasHookContext;
    private prefixPreview;
    private lastPartPreviewValues;
    private lastPartIsHookContext;
    private partCount;
    private hasRawEligibleContent;
    constructor(record: GoalEvidenceRecord);
    addFragment(record: GoalEvidenceRecord): void;
    finish(): GoalEvidenceRecordIndexHint;
    private finishPreviousPart;
}
export declare class GoalEvidenceCheckpointAccumulator {
    private readonly goal;
    private readonly candidateUuids;
    private readonly candidateUuidSet;
    private readonly captured;
    private readonly checkpointEntries;
    private readonly truncated;
    private readonly shouldCheckpoint;
    constructor(hints: readonly GoalEvidenceRecordIndexHint[], goal: GoalRecord, permit: GoalTurnPermit);
    getCandidateUuids(): readonly string[];
    capture(record: GoalEvidenceRecord): void;
    finish(): GoalEvidenceCheckpointWindow;
}
export declare function getGoalEvidenceRecordIndexHint(record: GoalEvidenceRecord): GoalEvidenceRecordIndexHint;
export declare function buildGoalEvidenceCatalog(input: GoalEvidenceContext): GoalEvidenceCatalog;
export declare function buildGoalEvidenceCheckpointWindow(input: GoalEvidenceContext): GoalEvidenceCheckpointWindow;
export declare function validateGoalEvidenceReferences(input: GoalEvidenceValidationInput): ValidatedGoalEvidence;
