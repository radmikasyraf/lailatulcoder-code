/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stage 1 HTTP→ACP bridge — backward-compat re-export shim.
 *
 * #4175 PR F1 lifted the bridge core (`BridgeClient`,
 * `defaultSpawnChannelFactory`, `createAcpSessionBridge` factory closure,
 * plus the supporting types/errors/options/status) to
 * `@lailatul-coder/acp-bridge`. This shim preserves the CLI-local bridge import
 * surface so `server.ts`, `run-qwen-serve.ts`, `workspace-agents.ts`,
 * `workspace-memory.ts`, `index.ts`, plus the bridge test suite, keep resolving
 * through one module.
 *
 * The implementation now lives at:
 *   - `@lailatul-coder/acp-bridge/bridge` — `createAcpSessionBridge` factory
 *   - `@lailatul-coder/acp-bridge/bridgeClient` — `BridgeClient` class +
 *     permission record types
 *   - `@lailatul-coder/acp-bridge/spawnChannel` — `defaultSpawnChannelFactory`
 *   - `@lailatul-coder/acp-bridge/bridgeOptions` — `BridgeOptions` +
 *     `DaemonStatusProvider` interfaces
 *   - `@lailatul-coder/acp-bridge/bridgeTypes` — bridge session + heartbeat
 *     types + `AcpSessionBridge` interface
 *   - `@lailatul-coder/acp-bridge/bridgeErrors` — typed bridge error classes
 *   - `@lailatul-coder/acp-bridge/workspacePaths` — `canonicalizeWorkspace`
 *     + `MAX_WORKSPACE_PATH_LENGTH`
 *   - `@lailatul-coder/acp-bridge/status` — protocol-versioned status types
 *     + idle envelope helpers
 *   - `@lailatul-coder/acp-bridge/channel` — `AcpChannel` + `ChannelFactory`
 *
 * The bridge is bound to a single canonical workspace
 * (`BridgeOptions.boundWorkspace`); multi-workspace deployments use
 * multiple daemon processes. See the module docstring on `bridge.ts`
 * in the lifted package for the full Stage 1/Stage 2 contract.
 */

export {
  createAcpSessionBridge,
  createHttpAcpBridge,
} from '@lailatul-coder/acp-bridge/bridge';
export {
  DEFAULT_SESSION_RESTORE_TIMEOUT_MS,
  MAX_SESSION_RESTORE_TIMEOUT_MS,
  resolveSessionRestoreTimeoutMs,
} from '@lailatul-coder/acp-bridge/sessionRestoreTimeout';
export { defaultSpawnChannelFactory } from '@lailatul-coder/acp-bridge/spawnChannel';
// `MAX_RESOLVED_PERMISSION_RECORDS`, `PendingPermission`,
// `PermissionResolutionRecord` re-exports were removed alongside the
// source definitions — the mediator now owns pending+resolved state.
export { BridgeClient } from '@lailatul-coder/acp-bridge/bridgeClient';
export type { BridgeClientSessionEntry } from '@lailatul-coder/acp-bridge/bridgeClient';

export type {
  AcpChannel,
  AcpChannelExitInfo,
  ChannelFactory,
} from '@lailatul-coder/acp-bridge';

export type {
  BridgeFreshSessionAdmission,
  BridgeFreshSessionAdmissionContext,
  BridgeFreshSessionReservation,
  BridgeSessionLifecycle,
  BridgeSessionLifecycleEvent,
  BridgeOptions,
  DaemonStatusProvider,
} from '@lailatul-coder/acp-bridge/bridgeOptions';

export type { BridgeFileSystem } from '@lailatul-coder/acp-bridge/bridgeFileSystem';

export type {
  BridgeSpawnRequest,
  BridgeSession,
  BridgeRestoreSessionRequest,
  BridgeSessionState,
  BridgeRestoredSession,
  BridgeSessionTranscriptPage,
  BridgeSessionTranscriptPageRequest,
  BridgeGenerationModelSource,
  BridgeGenerationStreamEvent,
  BridgeWorkspaceGenerationStreamEvent,
  BridgePromptContentBlock,
  BridgeSessionSummary,
  BridgeTurnStatus,
  BridgeSessionCatalogVersion,
  SessionMetadataUpdate,
  BridgeClientRequestContext,
  BridgeHeartbeatResult,
  BridgeHeartbeatState,
  BridgeWorkspaceMemoryRememberContextMode,
  BridgeWorkspaceMemoryRememberRequest,
  BridgeWorkspaceMemoryRememberResult,
  BridgeAutoMemoryTopic,
  BridgeWorkspaceMemoryForgetRequest,
  BridgeWorkspaceMemoryForgetMatch,
  BridgeWorkspaceMemoryForgetResult,
  BridgeWorkspaceMemoryDreamResult,
  BridgeDaemonStatusLimits,
  BridgeDaemonSessionDiagnostic,
  BridgeDaemonStatusSnapshot,
  BridgeShutdownOptions,
  AcpSessionBridge,
  HttpAcpBridge,
} from '@lailatul-coder/acp-bridge/bridgeTypes';

export {
  BranchWhilePromptActiveError,
  CdWhilePromptActiveError,
  SessionNotFoundError,
  RestoreInProgressError,
  SessionArchivedError,
  SessionNotArchivedError,
  SessionConflictError,
  SessionArchivingError,
  InvalidSessionScopeError,
  SessionLimitExceededError,
  PromptQueueFullError,
  PromptDeadlineExceededError,
  WorkspaceMismatchError,
  InvalidClientIdError,
  InvalidPermissionOptionError,
  InvalidSessionMetadataError,
  WorkspaceInitConflictError,
  WorkspaceInitPathEscapeError,
  WorkspaceInitSymlinkError,
  WorkspaceInitRaceError,
  McpServerNotFoundError,
  McpServerRestartFailedError,
  SessionBusyError,
  WorkspaceDrainingError,
  BridgeChannelQuarantinedError,
  InvalidRewindTargetError,
  TotalSessionLimitExceededError,
  NOT_CURRENTLY_GENERATING_CANCEL_MESSAGE,
  // Multi-client permission coordination errors.
  CancelSentinelCollisionError,
  PermissionForbiddenError,
  PermissionPolicyNotImplementedError,
  SessionShellClientRequiredError,
  SessionShellDisabledError,
} from '@lailatul-coder/acp-bridge/bridgeErrors';

export { SessionRestoreTimeoutError } from '@lailatul-coder/acp-bridge/status';

export {
  MAX_WORKSPACE_PATH_LENGTH,
  canonicalizeWorkspace,
} from '@lailatul-coder/acp-bridge/workspacePaths';

export {
  SessionArtifactAuthorizationError,
  SessionArtifactValidationError,
} from '@lailatul-coder/acp-bridge/sessionArtifacts';
