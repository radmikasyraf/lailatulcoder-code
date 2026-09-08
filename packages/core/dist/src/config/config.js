/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { getQualifiedVisionModelId, isFullTurnVisionCapable, selectVisionBridgeModel, } from '../services/visionBridge/vision-bridge-service.js';
import { ArenaAgentClient } from '../agents/arena/ArenaAgentClient.js';
// Core
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { GeminiClient } from '../core/client.js';
import { resolveInteractionMode } from '../core/prompts.js';
import { AuthType, createContentGenerator, resetPreloadedContentGenerator, resolveContentGeneratorConfigWithSources, } from '../core/contentGenerator.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { getRuntimeContentGenerator } from '../agents/runtime/agent-context.js';
import { isTieredEffortWireModel } from '../core/modalityDefaults.js';
import { DashScopeOpenAICompatibleProvider, selectDashScopeThinkingKnob, } from '../core/openaiContentGenerator/provider/dashscope.js';
// Services
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { FileHistoryService } from '../services/fileHistoryService.js';
import { StandardFileSystemService, } from '../services/fileSystemService.js';
import { cleanupStaleAgentWorktrees } from '../services/worktreeCleanup.js';
import { CronScheduler, DEFAULT_RECURRING_MAX_AGE_DAYS, normalizeRecurringMaxAge, } from '../services/cronScheduler.js';
import { MemoryPressureMonitor, DEFAULT_PRESSURE_CONFIG, validateMemoryPressureConfig, } from '../services/memoryPressureMonitor.js';
import { findGitRoot } from '../utils/gitUtils.js';
// Tools — only lightweight imports; tool classes are lazy-loaded via dynamic import
import { MCPServerStatus, getMCPServerStatus, } from '../tools/mcp-client.js';
import { setGeminiMdFilename } from '../memory/const.js';
import { canUseRipgrep } from '../utils/ripgrepUtils.js';
import { recordStartupEvent } from '../utils/startupEventSink.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { ToolNames } from '../tools/tool-names.js';
import { ApprovalMode } from './approval-mode.js';
// Other modules
import { ideContextStore } from '../ide/ideContext.js';
import { InputFormat, OutputFormat } from '../output/types.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { SkillManager } from '../skills/skill-manager.js';
import { maybeRunAutoSkillCurator } from '../skills/skill-curator.js';
import { PermissionManager } from '../permissions/permission-manager.js';
import { createDenialState, resetDenialState, } from '../permissions/denialTracking.js';
import { parseRule } from '../permissions/rule-parser.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import { BackgroundTaskRegistry } from '../agents/background-tasks.js';
import { MonitorRegistry } from '../services/monitorRegistry.js';
import { normalizeImageGenerationBaseUrl } from '../services/image-generation-service.js';
import { BackgroundAgentResumeService } from '../agents/background-agent-resume.js';
import { BackgroundShellRegistry } from '../services/backgroundShellRegistry.js';
import { WorkflowRunRegistry } from '../agents/workflow-run-registry.js';
import { FileReadCache } from '../services/fileReadCache.js';
import { resolveStopHookBlockingCap } from '../hooks/stopHookCap.js';
import { DEFAULT_MAX_TOOL_CALLS_PER_TURN } from '../services/loopDetectionService.js';
import { buildContextUsage } from '../hooks/context-usage.js';
import { DEFAULT_OTLP_ENDPOINT, DEFAULT_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH, DEFAULT_TELEMETRY_TARGET, SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT, isValidSensitiveSpanAttributeMaxLength, isTelemetrySdkInitialized, addDaemonRequestAttribute, initializeTelemetry, shutdownTelemetry, refreshSessionContext, logStartSession, logSessionEnd, logRipgrepFallback, RipgrepFallbackEvent, StartSessionEvent, } from '../telemetry/index.js';
import { ExtensionManager, } from '../extension/extensionManager.js';
import { HookSystem, createHookOutput, createInstructionsLoadedCallback, } from '../hooks/index.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType, } from '../confirmation-bus/types.js';
import { PermissionMode, NotificationType, } from '../hooks/types.js';
import { fireNotificationHook } from '../core/toolHookTriggers.js';
import { GOAL_HOOK_ID_OUTPUT_KEY } from '../goals/goalHook.js';
import { createGoalRuntime, GoalPersistenceUnavailableError, } from '../goals/goal-runtime.js';
import { createGoalCheckpointVerifier } from '../goals/goal-checkpoint-verifier.js';
import { createGoalVerifier } from '../goals/goal-verifier.js';
// Utils
import { shouldAttemptBrowserLaunch } from '../utils/browser.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import { shouldDefaultToNodePty } from '../utils/shell-utils.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import {} from '../utils/tool-utils.js';
import { FatalConfigError, getErrorMessage } from '../utils/errors.js';
import { normalizeProxyUrl } from '../utils/proxyUtils.js';
import { loadUndici, setResolvedProxyUrlForRuntimeFetch, redactProxyError, } from '../utils/runtimeFetchOptions.js';
import { DEFAULT_FILE_FILTERING_OPTIONS, DEFAULT_MEMORY_FILE_FILTERING_OPTIONS, } from './constants.js';
import { DEFAULT_QWEN_CUSTOM_IGNORE_FILE_NAMES } from '../utils/qwenIgnoreParser.js';
import { DEFAULT_TOOL_RESULTS_TOTAL_CHARS_THRESHOLD } from './clearContextDefaults.js';
import { DEFAULT_QWEN_EMBEDDING_MODEL } from './models.js';
import { registerSessionModel, registerSessionProjectDir, unregisterSessionModel, unregisterSessionProjectDir, } from '../utils/sessionIdContext.js';
import { Storage } from './storage.js';
import { ChatRecordingService, } from '../services/chatRecordingService.js';
import { CHARS_PER_TOKEN } from '../services/tokenEstimation.js';
import { clearRuntimeStatus, writeRuntimeStatus, } from '../utils/runtimeStatus.js';
import { deriveSessionName, patchSessionRecord, unregisterSession, } from '../services/session-registry.js';
import { SessionService, } from '../services/sessionService.js';
import { SessionTranscriptChangedError, SessionWriterError, SessionWriterLease, SessionWriterLostError, SessionWriterUnavailableError, } from '../services/session-writer-lease.js';
import { createHash, randomUUID } from 'node:crypto';
import { loadServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import { ConditionalRulesRegistry } from '../utils/rulesDiscovery.js';
import { createDebugLogger, setDebugLogSession, } from '../utils/debugLogger.js';
import { getAutoMemoryRoot, getAutoMemoryIndexPath, getTeamAutoMemoryRoot, getUserAutoMemoryIndexPath, getUserAutoMemoryRoot, } from '../memory/paths.js';
import { readAutoMemoryIndexWithStats, readUserAutoMemoryIndexWithStats, } from '../memory/store.js';
import { rebuildTeamAutoMemoryIndex, TeamMemoryRootSecurityError, } from '../memory/indexer.js';
import { syncTeamMemory } from '../memory/team-memory-sync.js';
import { getTeamMemoryShareabilityWarning } from '../memory/team-memory-git-status.js';
import { MemoryManager } from '../memory/manager.js';
import { CommitAttributionService } from '../services/commitAttribution.js';
import { isSafeModeEnv } from '../utils/safe-mode.js';
const gitCoAuthorLogger = createDebugLogger('GIT_CO_AUTHOR');
const memoryPressureConfigLogger = createDebugLogger('MEMORY_PRESSURE');
const MEMORY_CONTEXT_WARNING_RATIO = 0.15;
/** Re-inject the active Todo reminder every Nth tool turn, not every turn. */
const ACTIVE_TODO_REMINDER_REFRESH_TURNS = 3;
// Default `tools.toolSearch.threshold` (percent of the context window):
// mirrors the settings-schema default in packages/cli.
const DEFAULT_TOOL_SEARCH_THRESHOLD = 10;
import { ModelsConfig, } from '../models/index.js';
import { resolveModelId } from '../utils/modelId.js';
export function parseVisionModelSetting(setting) {
    if (!setting)
        return undefined;
    const nullIdx = setting.indexOf('\0');
    if (nullIdx < 0)
        return { selector: setting };
    const selector = setting.slice(0, nullIdx);
    if (!selector)
        return undefined;
    return {
        selector,
        baseUrl: setting.slice(nullIdx + 1) || undefined,
    };
}
function formatVisionModelSettingForLog(setting) {
    return setting.replace(/\0/g, '\\0');
}
export { DEFAULT_FILE_FILTERING_OPTIONS, DEFAULT_MEMORY_FILE_FILTERING_OPTIONS, };
export { ApprovalMode, APPROVAL_MODES } from './approval-mode.js';
/**
 * Thrown by `Config.setApprovalMode` when the requested mode would grant
 * privileged tool autonomy in a folder the user has not marked as trusted.
 *
 * Why: the daemon mutation route at `POST /session/:id/approval-mode` needs
 * to recognize this specific class of rejection and translate it into a
 * structured `errorKind: 'auth_env_error'` rather than a generic 500.
 * Using a named subclass lets the bridge match by `err.name` without
 * depending on the message text (which would drift across i18n).
 */
export class TrustGateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TrustGateError';
    }
}
/**
 * Detailed information about each approval mode.
 * Used for UI display and protocol responses.
 */
export const APPROVAL_MODE_INFO = {
    [ApprovalMode.PLAN]: {
        id: ApprovalMode.PLAN,
        name: 'Plan',
        description: 'Analyze only, do not modify files or execute commands',
    },
    [ApprovalMode.DEFAULT]: {
        id: ApprovalMode.DEFAULT,
        name: 'Default',
        description: 'Require approval for file edits or shell commands',
    },
    [ApprovalMode.AUTO_EDIT]: {
        id: ApprovalMode.AUTO_EDIT,
        name: 'Auto Edit',
        description: 'Automatically approve file edits',
    },
    [ApprovalMode.AUTO]: {
        id: ApprovalMode.AUTO,
        name: 'Auto',
        description: 'LLM classifier auto-approves safe actions, blocks risky ones',
    },
    [ApprovalMode.YOLO]: {
        id: ApprovalMode.YOLO,
        name: 'YOLO',
        description: 'Automatically approve all tools',
    },
};
export { DEFAULT_TOOL_RESULTS_TOTAL_CHARS_THRESHOLD } from './clearContextDefaults.js';
function normalizeGitCoAuthor(value) {
    if (typeof value === 'boolean') {
        return { commit: value, pr: value };
    }
    // Default to `true` (the schema default) ONLY when the sub-field
    // is genuinely absent. For PRESENT-but-non-boolean values, honor
    // common string forms (`"true"`/`"yes"`/`"on"`/`"1"` → true,
    // `"false"`/`"no"`/`"off"`/`"0"`/`""` → false) and treat anything
    // else as opt-out. settings.json is user-editable, and the previous
    // "default-to-true on mismatch" policy meant a hand-edited
    // `{ "commit": "false" }` silently activated attribution against
    // the user's clear intent. Safer-by-default: ambiguous values
    // disable rather than enable.
    const pickBool = (v, fieldName) => {
        if (v === undefined)
            return true;
        if (typeof v === 'boolean')
            return v;
        if (typeof v === 'string') {
            const lowered = v.trim().toLowerCase();
            if (lowered === 'true' ||
                lowered === 'yes' ||
                lowered === 'on' ||
                lowered === '1') {
                return true;
            }
            // Known disable-intent forms — silent (matches user intent).
            const knownDisable = ['false', 'no', 'off', '0', 'disabled', ''];
            if (!knownDisable.includes(lowered)) {
                // Unrecognised string — disable (safer-by-default) but log
                // so a user wondering "why is my setting being ignored?"
                // can see the actual coercion in QWEN_DEBUG_LOG_FILE.
                gitCoAuthorLogger.warn(`Unrecognized string value for general.gitCoAuthor.${fieldName}: ${JSON.stringify(v)}; treating as false. Accepted forms: true/yes/on/1, false/no/off/0/empty.`);
            }
            return false;
        }
        if (typeof v === 'number')
            return v === 1;
        return false;
    };
    return {
        commit: pickBool(value?.commit, 'commit'),
        pr: pickBool(value?.pr, 'pr'),
    };
}
export const DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD = 25_000;
export const DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES = 1000;
/**
 * Per-message budget (chars) for the combined model-facing output of one
 * batch of tool calls. When a batch's total output exceeds this, the largest
 * results are offloaded to disk (with a recoverable pointer). `<= 0` disables.
 */
export const DEFAULT_TOOL_OUTPUT_BATCH_BUDGET = 200_000;
/**
 * Scopes whose servers are checked-in / shareable and therefore untrusted: they
 * must be approved before the discovery layer connects them. `'system'`
 * (enterprise-enforced) and unset (user/default/CLI/extension) scopes are
 * trusted and never gated. See issue #4615.
 */
export function isGatedMcpScope(scope) {
    return scope === 'project' || scope === 'workspace';
}
/**
 * Test whether a server name matches a single pattern. Patterns use simple
 * glob semantics: `*` matches any sequence of characters (including empty),
 * `?` matches exactly one character. A pattern without glob characters is
 * compared as an exact string (no behavior change for existing configs).
 * Uses an iterative two-pointer algorithm — O(n×m) worst case, no regex,
 * no backtracking vulnerability.
 */
export function matchesServerPattern(name, pattern) {
    if (!pattern.includes('*') && !pattern.includes('?')) {
        return name === pattern;
    }
    let ni = 0;
    let pi = 0;
    let starNi = -1;
    let starPi = -1;
    while (ni < name.length) {
        if (pi < pattern.length &&
            (pattern[pi] === '?' || pattern[pi] === name[ni])) {
            ni++;
            pi++;
        }
        else if (pi < pattern.length && pattern[pi] === '*') {
            starPi = pi++;
            starNi = ni;
        }
        else if (starPi !== -1) {
            pi = starPi + 1;
            ni = ++starNi;
        }
        else {
            return false;
        }
    }
    while (pi < pattern.length && pattern[pi] === '*')
        pi++;
    return pi === pattern.length;
}
/**
 * Test whether a server name matches any pattern in the given list.
 * Returns false for an empty or undefined list.
 */
export function matchesAnyServerPattern(name, patterns) {
    if (!patterns || patterns.length === 0)
        return false;
    return patterns.some((p) => matchesServerPattern(name, p));
}
export class MCPServerConfig {
    command;
    args;
    env;
    cwd;
    url;
    httpUrl;
    headers;
    tcp;
    timeout;
    trust;
    description;
    includeTools;
    excludeTools;
    extensionName;
    oauth;
    authProviderType;
    targetAudience;
    targetServiceAccount;
    type;
    discoveryTimeoutMs;
    scope;
    alwaysLoadTools;
    agentPluginV1;
    constructor(
    // For stdio transport
    command, args, env, cwd, 
    // For sse transport
    url, 
    // For streamable http transport
    httpUrl, headers, 
    // For websocket transport
    tcp, 
    // Common
    timeout, trust, 
    // Metadata
    description, includeTools, excludeTools, extensionName, 
    // OAuth configuration
    oauth, authProviderType, 
    // Service Account Configuration
    /* targetAudience format: CLIENT_ID.apps.googleusercontent.com */
    targetAudience, 
    /* targetServiceAccount format: <service-account-name>@<project-num>.iam.gserviceaccount.com */
    targetServiceAccount, 
    // SDK MCP server type - 'sdk' indicates server runs in SDK process
    type, 
    /**
     * Per-server cap on the discovery handshake (`connect` + `tools/list` +
     * `prompts/list` + `resources/list`). Defaults: 30s for stdio servers,
     * 5s for remote HTTP/SSE. Tool-call timeout (`timeout` above) is
     * unaffected — a long-running tool invocation is not a startup
     * pathology. Appended at the end of the parameter list to avoid
     * shifting positional arguments at the many `new MCPServerConfig(...)`
     * call sites.
     */
    discoveryTimeoutMs, 
    /**
     * Provenance of this server config (see {@link McpServerScope}). Gated
     * scopes (`'project'`, `'workspace'`) are held behind the pending-approval
     * gate; `'system'` and unset scopes connect as before. Also drives
     * precedence in `assembleMcpServers`. Appended at the end of the parameter
     * list to avoid shifting positional arguments at the many
     * `new MCPServerConfig(...)` call sites. See issue #4615.
     */
    scope, alwaysLoadTools, agentPluginV1) {
        this.command = command;
        this.args = args;
        this.env = env;
        this.cwd = cwd;
        this.url = url;
        this.httpUrl = httpUrl;
        this.headers = headers;
        this.tcp = tcp;
        this.timeout = timeout;
        this.trust = trust;
        this.description = description;
        this.includeTools = includeTools;
        this.excludeTools = excludeTools;
        this.extensionName = extensionName;
        this.oauth = oauth;
        this.authProviderType = authProviderType;
        this.targetAudience = targetAudience;
        this.targetServiceAccount = targetServiceAccount;
        this.type = type;
        this.discoveryTimeoutMs = discoveryTimeoutMs;
        this.scope = scope;
        this.alwaysLoadTools = alwaysLoadTools;
        this.agentPluginV1 = agentPluginV1;
    }
}
/**
 * Check if an MCP server config represents an SDK server
 */
export function isSdkMcpServerConfig(config) {
    return config.type === 'sdk';
}
export var AuthProviderType;
(function (AuthProviderType) {
    AuthProviderType["DYNAMIC_DISCOVERY"] = "dynamic_discovery";
    AuthProviderType["GOOGLE_CREDENTIALS"] = "google_credentials";
    AuthProviderType["SERVICE_ACCOUNT_IMPERSONATION"] = "service_account_impersonation";
})(AuthProviderType || (AuthProviderType = {}));
function normalizeConfigOutputFormat(format) {
    if (!format) {
        return undefined;
    }
    switch (format) {
        case 'stream-json':
            return OutputFormat.STREAM_JSON;
        case 'json':
        case OutputFormat.JSON:
            return OutputFormat.JSON;
        case 'text':
        case OutputFormat.TEXT:
        default:
            return OutputFormat.TEXT;
    }
}
function loadMemoryPressureConfig() {
    const config = { ...DEFAULT_PRESSURE_CONFIG };
    try {
        config.softPressureRatio = readMemoryPressureRatioEnv('QWEN_MEMORY_PRESSURE_SOFT', config.softPressureRatio);
        config.hardPressureRatio = readMemoryPressureRatioEnv('QWEN_MEMORY_PRESSURE_HARD', config.hardPressureRatio);
        config.criticalRatio = readMemoryPressureRatioEnv('QWEN_MEMORY_PRESSURE_CRITICAL', config.criticalRatio);
        const enableGC = process.env['QWEN_MEMORY_ENABLE_GC'];
        if (enableGC &&
            ['0', 'false', 'off', 'no'].includes(enableGC.trim().toLowerCase())) {
            config.enableExplicitGC = false;
        }
        validateMemoryPressureConfig(config);
    }
    catch (err) {
        const fallbackMsg = '[QWEN] WARNING: Invalid memory pressure config; using defaults. ' +
            `Error: ${getErrorMessage(err)}`;
        process.stderr.write(`${fallbackMsg}\n`);
        memoryPressureConfigLogger.warn(fallbackMsg);
        return { ...DEFAULT_PRESSURE_CONFIG };
    }
    return config;
}
/** Default sub-agent nesting cap (1-based levels). */
export const DEFAULT_MAX_SUBAGENT_DEPTH = 5;
/** Ceiling for the nesting cap — catches typos the way maxToolCalls' does. */
export const MAX_SUBAGENT_DEPTH_LIMIT = 100;
/**
 * Normalizes a maxSubagentDepth value: absent or non-finite values fall back
 * to the default (NaN would silently block all nesting, Infinity — e.g.
 * JSON `1e309` — would unbound the recursion cap), and finite values floor
 * and clamp to the 1–{@link MAX_SUBAGENT_DEPTH_LIMIT} range. Values below 1
 * clamp up so the knob never disables sub-agents outright — it only bounds
 * nesting.
 *
 * Shared by the Config constructor and the resume path that restores
 * persisted launch flags, so a malformed or tampered agent sidecar cannot
 * bypass the nesting cap.
 */
export function normalizeMaxSubagentDepth(value) {
    return value == null || !Number.isFinite(value)
        ? DEFAULT_MAX_SUBAGENT_DEPTH
        : Math.min(MAX_SUBAGENT_DEPTH_LIMIT, Math.max(1, Math.floor(value)));
}
/**
 * Validates the session-turn limit at config and persisted-agent boundaries.
 */
export function validateMaxSessionTurns(value) {
    const resolved = value ?? -1;
    if (!Number.isInteger(resolved)) {
        throw new FatalConfigError(`Invalid maxSessionTurns: must be an integer, got ${String(resolved)}`);
    }
    return resolved;
}
function validateMaxToolCallsPerTurn(value) {
    const resolved = value ?? DEFAULT_MAX_TOOL_CALLS_PER_TURN;
    if (!Number.isInteger(resolved)) {
        throw new FatalConfigError(`Invalid maxToolCallsPerTurn: must be an integer, got ${String(resolved)}`);
    }
    return resolved;
}
/** Maximum number of fallback models allowed in the chain. */
const MAX_MODEL_FALLBACKS = 3;
/**
 * Normalize model fallback entries: deduplicate, trim, remove blanks,
 * and cap at {@link MAX_MODEL_FALLBACKS}.
 *
 * @param raw - Raw fallback model IDs, or undefined.
 * @returns A deduplicated, capped array of model IDs (may be empty).
 */
function normalizeModelFallbacks(raw) {
    if (!raw || raw.length === 0)
        return [];
    const seen = new Set();
    const result = [];
    for (const entry of raw) {
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        result.push(trimmed);
        if (result.length >= MAX_MODEL_FALLBACKS)
            break;
    }
    return result;
}
function readMemoryPressureRatioEnv(envName, fallback) {
    const raw = process.env[envName];
    if (!raw) {
        return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${envName} must be a finite number`);
    }
    return parsed;
}
const DEFAULT_BARE_CORE_TOOLS = [
    ToolNames.READ_FILE,
    ToolNames.EDIT,
    ToolNames.NOTEBOOK_EDIT,
    ToolNames.SHELL,
];
// Shared empty set returned by `Config.getDisabledSkillNames()` when no
// provider was attached. Frozen so callers cannot accidentally mutate the
// shared instance and leak state across Config instances.
const EMPTY_DISABLED_SKILL_NAMES = Object.freeze(new Set());
// Tracks whether the first Config in this process has claimed the global
// QWEN_CODE_SESSION_ID env var. Prevents throwaway Config instances from
// overwriting the real session's ID while still allowing nested lailatul-coder
// processes to claim their own (they start with a fresh module scope).
let sessionEnvClaimed = false;
let projectDirEnvClaimed = false;
let modelEnvClaimed = false;
function resolveSensitiveSpanAttributeMaxLength(value) {
    if (value === undefined) {
        return DEFAULT_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH;
    }
    if (!isValidSensitiveSpanAttributeMaxLength(value)) {
        throw new FatalConfigError(`Invalid telemetry.sensitiveSpanAttributeMaxLength: must be a positive integer no greater than ${SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT}, got ${String(value)}`);
    }
    return value;
}
/**
 * Resolves the recurring cron max age (in days) once at Config
 * construction — the setting declares `requiresRestart`, so re-reading
 * the environment per call could let the tool description, tool output,
 * and scheduler each report a different expiry if the env var changed
 * mid-session. The QWEN_CODE_CRON_MAX_AGE_DAYS environment variable
 * overrides the settings value (convenient for cloud/container
 * deployments). `normalizeRecurringMaxAge` owns the `0 → Infinity`
 * (no expiry) contract shared with the CronScheduler constructor.
 * Negative or unparseable values fall back to the 7-day default with a
 * console warning — debug file logging is usually off in the daemon
 * deployments this knob targets, and the misconfiguration would
 * otherwise surface only as "jobs stopped firing after 7 days".
 */
function resolveCronRecurringMaxAgeDays(setting) {
    const env = process.env['QWEN_CODE_CRON_MAX_AGE_DAYS'];
    const fromEnv = env !== undefined && env.trim() !== '';
    const raw = fromEnv ? Number(env) : setting;
    if (raw === undefined || !Number.isFinite(raw) || raw < 0) {
        if (raw !== undefined) {
            // eslint-disable-next-line no-console -- operator-facing misconfiguration breadcrumb; debug file logging is usually off in daemon deployments
            console.warn((fromEnv
                ? `QWEN_CODE_CRON_MAX_AGE_DAYS="${env}" is invalid`
                : `cronRecurringMaxAgeDays=${setting} is invalid`) +
                `; recurring cron jobs will expire after the ` +
                `${DEFAULT_RECURRING_MAX_AGE_DAYS}-day default.`);
        }
        return DEFAULT_RECURRING_MAX_AGE_DAYS;
    }
    return normalizeRecurringMaxAge(raw, DEFAULT_RECURRING_MAX_AGE_DAYS);
}
class SessionWriterShutdownError extends SessionWriterUnavailableError {
}
function containsErrorByIdentity(error, candidate) {
    return (error === candidate ||
        (error instanceof Error &&
            error.cause instanceof AggregateError &&
            error.cause.errors.includes(candidate)));
}
export class Config {
    sessionId;
    sessionSourceType;
    sessionSourceId;
    sessionData;
    pendingSessionRestoreProjection;
    sessionRestoreRuntime;
    sessionRestoreProjectionSource;
    restoredFileHistory = false;
    goalRestoreActivation;
    rejectGoalRestoreActivation;
    sessionRuntimeBaseDir;
    sessionProjectDirRegistered = false;
    pendingSessionWriterLease;
    pendingSessionWriterRelease;
    sessionWriterReclaimPolicy = 'local';
    sessionWriterTakeoverPolicy = 'never';
    sessionWriterShutdownRequested = false;
    sessionWriterHandoffRequested = false;
    sessionWriterActivationPromise;
    sessionWriterClosePromise;
    /**
     * One-shot notice produced by `setupStartupWorktree` (Phase D-1) when the
     * CLI was launched with `--worktree`. The active entry point (TUI XOR
     * headless) reads it via {@link consumePendingStartupWorktreeNotice} on
     * the model's first prompt and skips Phase C's `restoreWorktreeContext`
     * for that turn — startup wins over the resumed-session sidecar. ACP is
     * gated out earlier in `gemini.tsx` (mutex with `--worktree`) so it
     * never reaches this slot.
     *
     * @invariant At most one consumer per process. If a future entry path
     * sets this slot without ever consuming, the string persists until
     * process exit (which dies with the process — no leak).
     */
    pendingStartupWorktreeNotice = null;
    pendingRecoveredAgentsNotice = null;
    debugLogger;
    toolRegistry;
    /**
     * callback stashed BEFORE
     * `initialize()` runs and applied as soon as `toolRegistry` is up,
     * so the manager's `setOnBudgetEvent` is wired before
     * `startMcpDiscoveryInBackground` (or legacy blocking discovery)
     * fires the first pass. Pre-fix the acpAgent registered after
     * `initialize()` returned, missing the first pass entirely under
     * `QWEN_CODE_LEGACY_MCP_BLOCKING=1` and racing against background
     * discovery completion under the default mode.
     */
    pendingMcpBudgetCallback;
    promptRegistry;
    resourceRegistry;
    subagentManager;
    memoryPressureConfig;
    memoryPressureMonitor;
    backgroundTaskRegistry;
    monitorRegistry = new MonitorRegistry();
    backgroundAgentResumeService;
    backgroundShellRegistry = new BackgroundShellRegistry();
    workflowRunRegistry = new WorkflowRunRegistry();
    // Field initializer runs once on the parent Config; child Configs
    // built via Object.create(parent) intentionally do NOT pick this up
    // — see getFileReadCache() for the per-instance lazy initialization
    // that keeps subagent caches isolated from the parent's.
    fileReadCache = new FileReadCache();
    extensionManager;
    skillManager = null;
    permissionManager = null;
    toolInvocationGuard;
    modelInvocableCommandsProvider = null;
    modelInvocableCommandsExecutor = null;
    // Skill keys (e.g. "skill:foo") that coreToolScheduler announced inline on a
    // tool result. The client's drain consumes this set so it can mark them as
    // announced and avoid double-announcing in the same turn's tail reminder.
    pendingInlineAnnouncedSkillKeys = new Set();
    fileSystemService;
    contentGeneratorConfig;
    contentGeneratorConfigSources = {};
    contentGenerator;
    embeddingModel;
    modelsConfig;
    modelProvidersConfig;
    providerProtocolConfig;
    sandbox;
    targetDir;
    workspaceContext;
    debugMode;
    inputFormat;
    outputFormat;
    includePartialMessages;
    question;
    systemPrompt;
    appendSystemPrompt;
    liveAppendSystemPrompt;
    coreTools;
    allowedTools;
    excludeTools;
    disabledSlashCommands;
    disabledSkillNamesProvider;
    terminalImageRenderSupportProvider;
    disabledSkillLevels;
    customSkillDirs;
    //   `disabledTools` is set at construction
    // time but can be re-synced by the daemon mutation surface
    // (`setWorkspaceToolEnabled` propagates through ACP) so a subsequent
    // `discoverMcpToolsForServer` sees the latest disabled set instead
    // of the bootstrap snapshot. Stays `ReadonlySet` for callers; the
    // setter swaps the reference rather than mutating in place so any
    // captured reference (e.g. by ToolRegistry mid-iteration) remains
    // self-consistent.
    disabledTools;
    visibleTools;
    toolSearchThreshold;
    permissionsAllow;
    permissionsAsk;
    permissionsDeny;
    permissionsAutoMode;
    toolDiscoveryCommand;
    toolCallCommand;
    mcpServerCommand;
    mcpServers;
    /**
     * Names of MCP servers that were present in the effective server map but
     * disappeared after a runtime reconcile (hot-reload / `/reload`). Used only
     * to give a precise "this MCP server was removed this session" message when
     * the model later calls a tool that no longer exists (see
     * `CoreToolScheduler.getToolNotFoundMessage`). Self-heals: a name is dropped
     * from the set the moment the server reappears in the effective map.
     */
    recentlyRemovedMcpServers = new Set();
    topTierMcpServers;
    runtimeMcpServers = new Map();
    lspEnabled;
    lspClient;
    lspInitializationError;
    allowedMcpServers;
    /** Immutable upper bound from `--allowed-mcp-server-names`; see ConfigParameters. */
    cliAllowedMcpServerNames;
    excludedMcpServers;
    pendingMcpServers;
    mcpToolIdleTimeoutMs;
    /**
     * Guards against concurrent MCP reconcile passes (hot-reload watcher vs.
     * `/reload`). `SettingsWatcher` serializes its own listeners, but `/reload`
     * shares no such lock; without this, two `reinitializeMcpServers` calls could
     * interleave their `discoverAllMcpToolsIncremental` passes. See sub-task 3.
     */
    mcpReconcileInProgress = false;
    mcpReconcilePending = false;
    /**
     * The in-flight reconcile (pass 1 + its coalesced drain loop), exposed so a
     * call arriving mid-flight can await the same work instead of returning
     * before its coalesced change has actually been applied. Cleared when the
     * loop settles.
     */
    mcpReconcilePromise;
    sessionSubagents;
    userMemory;
    /**
     * The cross-session-stable prefix of the main-session system prompt —
     * the stable → context layers `GeminiClient.getMainSessionSystemInstruction()`
     * assembles before the volatile tails (git status, auto-memory). Recorded
     * so the Anthropic converter can place an early cache breakpoint on the
     * stable prefix; consumers match it via `startsWith` and fail open to the
     * single-block layout when it doesn't match the request's system text.
     */
    staticSystemPrefix;
    /**
     * Volatile system-prompt layer: the managed auto-memory section
     * (instructions + MEMORY.md indexes). Kept separate from `userMemory`
     * (context files, stable in-session) because it is rewritten on every
     * memory save — prompt assembly appends it last so a save invalidates
     * the shortest possible cached prompt prefix.
     */
    autoMemoryPrompt = '';
    sdkMode;
    geminiMdFileCount;
    loadedContextFilePaths = [];
    conditionalRulesRegistry;
    contextRuleExcludes;
    approvalMode;
    prePlanMode;
    approvalModeRevision = 0;
    manualPlanExitNoticeEventState = {
        version: 0,
        kind: 'clear',
    };
    manualPlanExitNoticeCursorState = {
        seenVersion: 0,
    };
    autoModeDenialState = createDenialState();
    accessibility;
    showResponseTokensPerSecond;
    telemetrySettings;
    telemetryInitializationDeferred;
    outboundCorrelationSettings;
    gitCoAuthor;
    usageStatisticsEnabled;
    fileReadCacheDisabled;
    activeTodoReminders = new Map();
    activeTodoWorkChainOwners = new Map();
    activeTodoReminderTurns = new Map();
    geminiClient;
    baseLlmClient;
    cronScheduler = null;
    fileFiltering;
    fileDiscoveryService = null;
    sessionService = undefined;
    chatRecordingService = undefined;
    goalRuntime;
    goalRuntimeReady;
    /**
     * A Goal restore held back because the session writer is not accepting
     * writes yet. Settled by {@link startPendingGoalRestore} once the
     * recorder has its lease, or by {@link settlePendingGoalRestore} when the
     * writer never arrives.
     */
    pendingGoalRestore;
    goalTurnHost;
    goalTurnHostUnbind;
    goalTurnHostGeneration = 0;
    chatRecordingFailureListeners = new Set();
    fileCheckpointingEnabled;
    // Object (not primitive) so sub-agents via Object.create(parentConfig)
    // share the same budget instance through prototype lookup.
    toolResultBudget = { bytesWritten: 0 };
    fileHistoryService;
    proxy;
    cwd;
    explicitIncludeDirectories;
    bugCommand;
    outputLanguageFilePath;
    noBrowser;
    folderTrustFeature;
    folderTrust;
    ideMode;
    maxSessionTurns;
    maxSubagentDepth;
    maxWallTimeSeconds;
    maxToolCalls;
    clearContextOnIdle;
    sessionTokenLimit;
    listExtensions;
    overrideExtensions;
    cliVersion;
    runtimeStatusEnabled = false;
    sessionRegistryActive = false;
    sessionRegistered = false;
    experimentalZedIntegration = false;
    sessionWriterLeaseEnabled = false;
    cronEnabled = true;
    /** Recurring cron max age in days, resolved once at construction
     * (the setting declares `requiresRestart`); `Infinity` = no expiry. */
    cronRecurringMaxAgeDays;
    lsToolEnabled = false;
    agentTeamEnabled = false;
    artifactEnabled = true;
    artifactAutoOpen = true;
    artifactPublisher = 'local';
    artifactHost;
    artifactOss;
    workflowsEnabled = false;
    skipWorkflowUsageWarning = false;
    computerUseEnabled = true;
    computerUseMaxImageDimension;
    computerUseIdleTimeoutMs;
    emitToolUseSummaries = true;
    chatRecordingEnabled;
    loadMemoryFromIncludeDirectories = false;
    importFormat;
    chatCompression;
    autoCompactThreshold;
    interactive;
    trustedFolder;
    useRipgrep;
    useBuiltinRipgrep;
    shouldUseNodePtyShell;
    preventSystemSleep;
    skipNextSpeakerCheck;
    shellExecutionConfig;
    arenaManager = null;
    arenaManagerChangeCallback = null;
    arenaAgentClient;
    teamManager = null;
    teamManagerChangeCallbacks = new Set();
    teamContext = null;
    agentsSettings;
    worktreeSettings;
    skipLoopDetection;
    maxToolCallsPerTurn;
    maxToolCallsPerTurnExplicit;
    skipStartupContext;
    bareMode;
    safeMode;
    warnings;
    allowedHttpHookUrls;
    allowPrivateNetworkHooks;
    onPersistPermissionRuleCallback;
    initialized = false;
    initializationPromise;
    initializationSucceeded = false;
    initializationSettled = false;
    shutdownRequested = false;
    resourceShutdownAfterInitializationScheduled = false;
    resourceShutdownPromise;
    proxyDispatcherReady;
    storage;
    runtimeStatusWrite = Promise.resolve();
    sessionRegistryWrite = Promise.resolve();
    fileExclusions;
    truncateToolOutputThreshold;
    truncateToolOutputThresholdExplicit;
    truncateToolOutputLines;
    toolOutputBatchBudget;
    shellDefaultTimeoutMs;
    shellHeartbeatIntervalMs;
    eventEmitter;
    channel;
    jsonFd;
    jsonFile;
    jsonSchema;
    inputFile;
    plansDir;
    plansDirectoryConfigured;
    defaultFileEncoding;
    enableManagedAutoMemory;
    enableManagedAutoDream;
    enableTeamMemory;
    enableTeamMemorySync;
    // Latch (keyed by projectRoot) so the "team memory enabled but not shareable"
    // warning is emitted at most once per repo, even though refreshHierarchicalMemory
    // may re-run. Keyed rather than a single boolean so entering a new repo (/cd)
    // re-checks shareability instead of reusing the first repo's result.
    teamMemoryShareabilityChecked = new Set();
    enableAutoSkill;
    autoSkillConfirm;
    memoryAgentTimeoutMinutes;
    memoryAgentMaxTurns;
    fastModel;
    webSearchSettings;
    webSearchNoticeEmitted = false;
    visionModel;
    compactionModel;
    imageModel;
    visionBridgeTimeoutMs;
    modelFallbacks;
    disableAllHooks;
    stopHookBlockingCap;
    /** User-level hooks (always loaded regardless of trust) */
    userHooks;
    /** Project-level hooks (only loaded in trusted folders) */
    projectHooks;
    /** @deprecated Legacy merged hooks field - use userHooks/projectHooks instead */
    hooks;
    hookSystem;
    messageBus;
    memoryManager;
    modelChangeListeners = new Set();
    // True on the Config that claimed the process-global QWEN_CODE_MODEL slot
    // (first in this process); gates the global write in publishModelEnv so no
    // other instance updates it. Per-session publishing is not gated on it.
    ownsModelEnvSlot = false;
    settingsWatcher;
    constructor(params) {
        this.sessionRuntimeBaseDir = Storage.getRuntimeBaseDir();
        this.sessionId = params.sessionId ?? randomUUID();
        // Only set the global env marker once per process lifetime, so
        // throwaway Config instances (e.g. telemetry-only) don't clobber
        // the real interactive session's ID. Uses a module-level flag
        // rather than checking env existence — otherwise a nested lailatul-coder
        // launched from within a session would inherit the parent's ID and
        // never claim its own.
        if (!sessionEnvClaimed && process.env) {
            process.env['QWEN_CODE_SESSION_ID'] = this.sessionId;
            sessionEnvClaimed = true;
        }
        this.sessionData = params.sessionData;
        this.sessionRestoreProjectionSource = params.sessionRestoreProjectionSource;
        this.setSessionRestoreProjection(params.sessionRestoreProjection);
        setDebugLogSession(this);
        this.debugLogger = createDebugLogger();
        this.embeddingModel = params.embeddingModel ?? DEFAULT_QWEN_EMBEDDING_MODEL;
        this.fileSystemService = new StandardFileSystemService();
        this.sandbox = params.sandbox;
        this.targetDir = path.resolve(params.targetDir);
        this.plansDirectoryConfigured = Boolean(params.plansDirectory?.trim());
        this.plansDir = Storage.getPlansDir(this.targetDir, params.plansDirectory);
        this.explicitIncludeDirectories = Array.from(new Set(params.includeDirectories ?? []));
        this.workspaceContext = new WorkspaceContext(this.targetDir, this.explicitIncludeDirectories);
        this.debugMode = params.debugMode;
        this.inputFormat = params.inputFormat ?? InputFormat.TEXT;
        const normalizedOutputFormat = normalizeConfigOutputFormat(params.outputFormat ?? params.output?.format);
        this.outputFormat = normalizedOutputFormat ?? OutputFormat.TEXT;
        this.includePartialMessages = params.includePartialMessages ?? false;
        this.question = params.question;
        this.systemPrompt = params.systemPrompt;
        this.appendSystemPrompt = params.appendSystemPrompt;
        this.coreTools = params.coreTools;
        this.allowedTools = params.allowedTools;
        this.excludeTools = params.excludeTools;
        this.disabledSlashCommands = Object.freeze([
            ...(params.disabledSlashCommands ?? []),
        ]);
        this.disabledSkillNamesProvider = params.disabledSkillNamesProvider ?? null;
        this.terminalImageRenderSupportProvider =
            params.terminalImageRenderSupportProvider ?? null;
        this.disabledSkillLevels = new Set(params.disabledSkillLevels ?? []);
        this.customSkillDirs = Object.freeze([...(params.customSkillDirs ?? [])]);
        this.disabledTools = new Set(params.disabledTools ?? []);
        this.visibleTools = new Set((params.visibleTools ?? []).filter((name) => typeof name === 'string'));
        this.toolSearchThreshold =
            params.toolSearchThreshold ?? DEFAULT_TOOL_SEARCH_THRESHOLD;
        this.permissionsAllow = params.permissions?.allow || [];
        this.permissionsAsk = params.permissions?.ask || [];
        this.permissionsDeny = params.permissions?.deny || [];
        this.permissionsAutoMode = params.permissions?.autoMode ?? {};
        this.toolInvocationGuard = params.toolInvocationGuard;
        this.toolDiscoveryCommand = params.toolDiscoveryCommand;
        this.toolCallCommand = params.toolCallCommand;
        this.mcpServerCommand = params.mcpServerCommand;
        this.mcpServers = params.mcpServers;
        this.topTierMcpServers = params.topTierMcpServers;
        this.lspEnabled = params.lsp?.enabled ?? false;
        this.lspClient = params.lspClient;
        this.allowedMcpServers = params.allowedMcpServers;
        this.cliAllowedMcpServerNames = params.cliAllowedMcpServerNames;
        this.excludedMcpServers = params.excludedMcpServers;
        this.pendingMcpServers = params.pendingMcpServers;
        const envTimeout = process.env['QWEN_CODE_MCP_TOOL_IDLE_TIMEOUT_MS'];
        const parsedEnv = envTimeout !== undefined ? Number(envTimeout) : NaN;
        this.mcpToolIdleTimeoutMs =
            params.mcpToolIdleTimeoutMs ??
                (Number.isFinite(parsedEnv) && parsedEnv >= 0 ? parsedEnv : 300000); // 5 minutes default
        this.sessionSubagents = params.sessionSubagents ?? [];
        this.sdkMode = params.sdkMode ?? false;
        this.userMemory = params.userMemory ?? '';
        this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
        this.contextRuleExcludes = params.contextRuleExcludes ?? [];
        this.approvalMode = params.approvalMode ?? ApprovalMode.AUTO;
        this.accessibility = params.accessibility ?? {};
        this.showResponseTokensPerSecond =
            params.showResponseTokensPerSecond ?? false;
        this.telemetrySettings = {
            enabled: params.telemetry?.enabled ?? false,
            target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
            otlpEndpoint: params.telemetry?.otlpEndpoint,
            otlpProtocol: params.telemetry?.otlpProtocol,
            otlpTracesEndpoint: params.telemetry?.otlpTracesEndpoint,
            otlpLogsEndpoint: params.telemetry?.otlpLogsEndpoint,
            otlpMetricsEndpoint: params.telemetry?.otlpMetricsEndpoint,
            logPrompts: params.telemetry?.logPrompts ?? true,
            userId: params.telemetry?.userId?.trim() || undefined,
            includeSensitiveSpanAttributes: params.telemetry?.includeSensitiveSpanAttributes ?? false,
            sensitiveSpanAttributeMaxLength: resolveSensitiveSpanAttributeMaxLength(params.telemetry?.sensitiveSpanAttributeMaxLength),
            outfile: params.telemetry?.outfile,
            resourceAttributes: params.telemetry?.resourceAttributes,
            metrics: params.telemetry?.metrics,
            resourceAttributeWarnings: params.telemetry?.resourceAttributeWarnings,
        };
        this.telemetryInitializationDeferred =
            params.deferTelemetryInitialization ?? false;
        this.outboundCorrelationSettings = {
            propagateTraceContext: params.outboundCorrelation?.propagateTraceContext ?? false,
        };
        this.gitCoAuthor = {
            ...normalizeGitCoAuthor(params.gitCoAuthor),
            name: 'lailatul-coderr',
            email: 'lailatul-coderr@alibabacloud.com',
        };
        this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;
        this.fileReadCacheDisabled = params.fileReadCacheDisabled ?? false;
        this.outputLanguageFilePath = params.outputLanguageFilePath;
        this.fileFiltering = {
            respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
            respectQwenIgnore: params.fileFiltering?.respectQwenIgnore ?? true,
            customIgnoreFiles: params.fileFiltering?.customIgnoreFiles ?? [
                ...DEFAULT_QWEN_CUSTOM_IGNORE_FILE_NAMES,
            ],
            enableRecursiveFileSearch: params.fileFiltering?.enableRecursiveFileSearch ?? true,
            enableFuzzySearch: params.fileFiltering?.enableFuzzySearch ?? true,
        };
        this.fileCheckpointingEnabled =
            params.fileCheckpointingEnabled ??
                (!params.sdkMode && (params.interactive ?? false));
        this.proxy = params.proxy;
        this.cwd = params.cwd ?? process.cwd();
        this.fileDiscoveryService = params.fileDiscoveryService ?? null;
        this.bugCommand = params.bugCommand;
        this.maxSessionTurns = validateMaxSessionTurns(params.maxSessionTurns);
        this.maxSubagentDepth = normalizeMaxSubagentDepth(params.maxSubagentDepth);
        this.maxWallTimeSeconds = params.maxWallTimeSeconds ?? -1;
        this.maxToolCalls = params.maxToolCalls ?? -1;
        const clearContextOnIdle = params.clearContextOnIdle;
        const toolResultsThresholdMinutes = clearContextOnIdle?.toolResultsThresholdMinutes ?? 60;
        this.clearContextOnIdle = {
            toolResultsThresholdMinutes,
            toolResultsNumToKeep: clearContextOnIdle?.toolResultsNumToKeep ?? 5,
            toolResultsTotalCharsThreshold: clearContextOnIdle?.toolResultsTotalCharsThreshold ??
                ((clearContextOnIdle?.toolResultsThresholdMinutes ?? 0) < 0
                    ? -1
                    : DEFAULT_TOOL_RESULTS_TOTAL_CHARS_THRESHOLD),
        };
        this.sessionTokenLimit = params.sessionTokenLimit ?? -1;
        this.experimentalZedIntegration =
            params.experimentalZedIntegration ?? false;
        this.sessionWriterLeaseEnabled =
            this.experimentalZedIntegration === true &&
                params.sessionWriterLeaseEnabled === true;
        this.cronEnabled = params.cronEnabled ?? true;
        this.cronRecurringMaxAgeDays = resolveCronRecurringMaxAgeDays(params.cronRecurringMaxAgeDays);
        this.lsToolEnabled = params.lsToolEnabled ?? false;
        this.agentTeamEnabled = params.agentTeamEnabled ?? false;
        this.artifactEnabled = params.artifactEnabled ?? true;
        this.artifactAutoOpen = params.artifactAutoOpen ?? true;
        this.artifactPublisher = params.artifactPublisher ?? 'local';
        this.artifactHost = params.artifactHost;
        this.artifactOss = params.artifactOss;
        this.workflowsEnabled = params.workflowsEnabled ?? false;
        this.skipWorkflowUsageWarning = params.skipWorkflowUsageWarning ?? false;
        this.computerUseEnabled = params.computerUseEnabled ?? true;
        this.computerUseMaxImageDimension = params.computerUseMaxImageDimension;
        this.computerUseIdleTimeoutMs = params.computerUseIdleTimeoutMs;
        this.emitToolUseSummaries = params.emitToolUseSummaries ?? true;
        this.listExtensions = params.listExtensions ?? false;
        this.overrideExtensions = params.overrideExtensions;
        this.noBrowser = params.noBrowser ?? false;
        this.folderTrustFeature = params.folderTrustFeature ?? false;
        this.folderTrust = params.folderTrust ?? false;
        this.ideMode = params.ideMode ?? false;
        this.modelProvidersConfig = params.modelProvidersConfig;
        this.providerProtocolConfig = params.providerProtocolConfig;
        this.cliVersion = params.cliVersion;
        this.chatRecordingEnabled = params.chatRecording ?? true;
        this.loadMemoryFromIncludeDirectories =
            params.loadMemoryFromIncludeDirectories ?? false;
        this.importFormat = params.importFormat ?? 'tree';
        this.chatCompression = params.chatCompression;
        this.autoCompactThreshold = params.autoCompactThreshold;
        this.interactive = params.interactive ?? false;
        this.trustedFolder = params.trustedFolder;
        this.skipLoopDetection = params.skipLoopDetection ?? false;
        this.maxToolCallsPerTurn = validateMaxToolCallsPerTurn(params.maxToolCallsPerTurn);
        // Whether the user explicitly set the cap (vs. the resolved default). An
        // explicit value is honored as a hard cap; the default is adaptive.
        this.maxToolCallsPerTurnExplicit = params.maxToolCallsPerTurn !== undefined;
        this.skipStartupContext = params.skipStartupContext ?? false;
        this.bareMode = params.bareMode ?? false;
        this.safeMode = params.safeMode ?? isSafeModeEnv();
        if (this.safeMode) {
            this.debugLogger.info('Safe mode active: hooks, extensions, skills, MCP servers, context files, rules disabled');
        }
        this.warnings = params.warnings ?? [];
        this.addLegacyPlanLocationWarning();
        this.allowedHttpHookUrls = params.allowedHttpHookUrls ?? [];
        this.allowPrivateNetworkHooks = params.allowPrivateNetworkHooks ?? false;
        this.onPersistPermissionRuleCallback = params.onPersistPermissionRule;
        // (web search removed)
        this.useRipgrep = params.useRipgrep ?? true;
        this.useBuiltinRipgrep = params.useBuiltinRipgrep ?? true;
        this.shouldUseNodePtyShell =
            params.shouldUseNodePtyShell ?? shouldDefaultToNodePty();
        this.preventSystemSleep = params.preventSystemSleep ?? true;
        this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? true;
        this.shellExecutionConfig = {
            terminalWidth: params.shellExecutionConfig?.terminalWidth ?? 80,
            terminalHeight: params.shellExecutionConfig?.terminalHeight ?? 24,
            showColor: params.shellExecutionConfig?.showColor ?? false,
            pager: params.shellExecutionConfig?.pager,
            maxBufferedOutputBytes: params.shellExecutionConfig?.maxBufferedOutputBytes,
        };
        this.truncateToolOutputThreshold =
            params.truncateToolOutputThreshold ??
                DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD;
        // Preserve whether the raw setting was provided: Shell uses its own
        // fallback when it is absent, so producers must not pass a defaulted value.
        this.truncateToolOutputThresholdExplicit =
            params.truncateToolOutputThreshold != null;
        this.truncateToolOutputLines =
            params.truncateToolOutputLines ?? DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES;
        this.toolOutputBatchBudget =
            params.toolOutputBatchBudget ?? DEFAULT_TOOL_OUTPUT_BATCH_BUDGET;
        // Guard: nothing validates settings.json on the load path (the schema only
        // runs on the /config write path), so this is the only real gate. The value
        // reaches `AbortSignal.timeout()`, which requires an integer in [0, 2^31-1];
        // a negative or fractional value would throw RangeError or silently degrade
        // to a 1ms timeout. Unlike the vision bridge, 0 is valid here and disables
        // the timeout. Reject anything the timer can't take and fall back to the
        // built-in default.
        this.shellDefaultTimeoutMs =
            params.shellDefaultTimeoutMs !== undefined &&
                Number.isInteger(params.shellDefaultTimeoutMs) &&
                params.shellDefaultTimeoutMs >= 0 &&
                params.shellDefaultTimeoutMs <= 2_147_483_647
                ? params.shellDefaultTimeoutMs
                : undefined;
        // Same timer-safety gate as shellDefaultTimeoutMs: the value reaches
        // `setInterval`, which needs an integer in [0, 2^31-1]. 0 is valid and
        // disables heartbeats.
        this.shellHeartbeatIntervalMs =
            params.shellHeartbeatIntervalMs !== undefined &&
                Number.isInteger(params.shellHeartbeatIntervalMs) &&
                params.shellHeartbeatIntervalMs >= 0 &&
                params.shellHeartbeatIntervalMs <= 2_147_483_647
                ? params.shellHeartbeatIntervalMs
                : undefined;
        this.channel = params.channel;
        this.jsonFd = params.jsonFd;
        this.jsonFile = params.jsonFile;
        this.jsonSchema = params.jsonSchema;
        this.inputFile = params.inputFile;
        this.defaultFileEncoding = params.defaultFileEncoding;
        this.storage = new Storage(this.targetDir, this.sessionRuntimeBaseDir);
        // Publish the project dir a subprocess needs to find this session's harness
        // records. It is derived from the session's *launch* cwd, so a subprocess
        // that has `cd`-ed elsewhere — which the /review skill explicitly does, into
        // a PR worktree — cannot recompute it from `process.cwd()`; it would land on
        // a directory that never existed.
        //
        // Registered per session, not claimed in one process-global slot. In daemon
        // mode one process serves many sessions: a single slot would hold whichever
        // booted first, and every later session would hand its subprocesses another
        // session's directory. The env var is still set for the single-session CLI,
        // where it is the only consumer and there is nothing to collide with.
        if (!projectDirEnvClaimed && process.env) {
            process.env['QWEN_CODE_PROJECT_DIR'] = this.storage.getProjectDir();
            projectDirEnvClaimed = true;
        }
        this.inputFormat = params.inputFormat ?? InputFormat.TEXT;
        this.fileExclusions = new FileExclusions(this);
        this.eventEmitter = params.eventEmitter;
        this.arenaAgentClient = ArenaAgentClient.create();
        this.agentsSettings = params.agents ?? {};
        this.backgroundTaskRegistry = new BackgroundTaskRegistry({
            ...(this.agentsSettings.maxParallelAgents !== undefined
                ? {
                    maxConcurrentBackgroundAgents: this.agentsSettings.maxParallelAgents,
                }
                : {}),
            ...(this.agentsSettings.maxParallelAgentsByModel !== undefined
                ? {
                    maxConcurrentBackgroundAgentsByModel: this.agentsSettings.maxParallelAgentsByModel,
                }
                : {}),
        });
        this.worktreeSettings = params.worktree ?? {};
        if (params.contextFileName) {
            setGeminiMdFilename(params.contextFileName);
        }
        // Create ModelsConfig for centralized model management
        // Prefer params.authType over generationConfig.authType because:
        // - params.authType preserves undefined (user hasn't selected yet)
        // - generationConfig.authType may have a default value from resolvers
        this.modelsConfig = new ModelsConfig({
            initialAuthType: params.authType ?? params.generationConfig?.authType,
            modelProvidersConfig: this.modelProvidersConfig,
            providerProtocolConfig: this.providerProtocolConfig,
            generationConfig: {
                model: params.model,
                ...(params.generationConfig || {}),
                baseUrl: params.generationConfig?.baseUrl,
            },
            generationConfigSources: params.generationConfigSources,
            initialRegistryBaseUrl: params.initialModelRegistryBaseUrl,
            onModelChange: this.handleModelChange.bind(this),
        });
        // Publish the active model id for shell subprocesses. Every Config
        // publishes its own session's model — publishModelEnv registers it per
        // session, like the project dir above, so daemon-mode subprocesses read
        // theirs, not the first session's. The process-global slot is claimed
        // first-writer-wins, as QWEN_CODE_SESSION_ID is, so a throwaway Config
        // never clobbers the live session's global value. Done here rather than
        // alongside the session ID because the value comes from the ModelsConfig
        // just constructed.
        if (!modelEnvClaimed && process.env) {
            modelEnvClaimed = true;
            this.ownsModelEnvSlot = true;
        }
        this.publishModelEnv();
        if (this.telemetrySettings.enabled &&
            !this.telemetryInitializationDeferred) {
            // Fire-and-forget: the SDK module loads asynchronously (issue #4748),
            // and spans/logs emitted before it settles are dropped by the
            // isTelemetrySdkInitialized() gates — same as the deferred TUI path.
            // Promise.resolve guards against auto-mocked initializeTelemetry
            // returning undefined in tests.
            void Promise.resolve(initializeTelemetry(this)).catch((error) => {
                this.debugLogger.error('Failed to initialize telemetry:', error);
            });
        }
        const proxyUrl = this.getProxy();
        if (proxyUrl) {
            // Use EnvHttpProxyAgent (not a bare ProxyAgent) so `NO_PROXY` is
            // honored. A bare ProxyAgent tunnels EVERY request — including local
            // MCP servers reached over `http://localhost:...` — through the proxy,
            // which typically can't route back to localhost and fails with an
            // opaque `fetch failed`. EnvHttpProxyAgent connects hosts listed in
            // `NO_PROXY` (e.g. `localhost,127.0.0.1`) directly while still proxying
            // everything else (LLM API calls, remote MCP). The explicit
            // `--proxy` / `settings.proxy` value (resolved by `getProxy()`)
            // overrides env `http(s)_proxy`; `NO_PROXY` continues to come from the
            // environment. See issue #3696 (local MCP + corporate proxy).
            //
            // undici loads behind a dynamic import to keep it out of the eager
            // startup closure (issue #7264); initialize() awaits this promise so
            // the dispatcher is installed before any network activity.
            this.proxyDispatcherReady = loadUndici()
                .then(({ EnvHttpProxyAgent, setGlobalDispatcher }) => {
                setGlobalDispatcher(new EnvHttpProxyAgent({
                    httpProxy: proxyUrl,
                    httpsProxy: proxyUrl,
                }));
                // Paths that pin their own dispatcher off the global one (the MCP
                // streamable HTTP fetch) read the explicit proxy back from here
                // (#7195).
                setResolvedProxyUrlForRuntimeFetch(proxyUrl);
            })
                .catch((error) => {
                // Redact before logging: the error can embed the proxy URL with
                // credentials. Rethrow so initialize() fails loudly, matching the
                // old synchronous constructor behavior.
                this.debugLogger.error('Failed to install proxy dispatcher:', redactProxyError(error));
                throw error;
            });
            // Swallow an early rejection so it cannot become an unhandledRejection
            // before initialize() awaits (and surfaces) the stored promise.
            this.proxyDispatcherReady.catch(() => { });
        }
        this.geminiClient = new GeminiClient(this);
        this.chatRecordingService = this.chatRecordingEnabled
            ? this.createChatRecordingService()
            : undefined;
        if (!this.sessionRestoreProjectionSource ||
            this.sessionRestoreRuntime ||
            !this.sessionWriterLeaseEnabled) {
            this.initializeGoalRuntime(this.sessionRestoreRuntime?.goalRecords ??
                this.sessionData?.conversation.messages, this.sessionRestoreRuntime);
        }
        this.extensionManager = new ExtensionManager({
            workspaceDir: this.targetDir,
            enabledExtensionOverrides: this.overrideExtensions,
            isWorkspaceTrusted: this.isTrustedFolder(),
            locale: params.locale,
        });
        this.enableManagedAutoMemory = params.enableManagedAutoMemory ?? true;
        this.enableManagedAutoDream = params.enableManagedAutoDream ?? true;
        this.enableTeamMemory = params.enableTeamMemory ?? false;
        this.enableTeamMemorySync = params.enableTeamMemorySync ?? false;
        this.enableAutoSkill = params.enableAutoSkill ?? false;
        this.autoSkillConfirm = params.autoSkillConfirm ?? true;
        // Clamp: schema validation only runs on interactive edit paths, so a
        // negative value in settings.json would otherwise reach the agent runtime
        // and make every memory agent time out immediately.
        this.memoryAgentTimeoutMinutes =
            params.memoryAgentTimeoutMinutes !== undefined &&
                params.memoryAgentTimeoutMinutes >= 0
                ? params.memoryAgentTimeoutMinutes
                : undefined;
        this.memoryAgentMaxTurns =
            params.memoryAgentMaxTurns !== undefined &&
                Number.isInteger(params.memoryAgentMaxTurns) &&
                params.memoryAgentMaxTurns >= 0
                ? params.memoryAgentMaxTurns
                : undefined;
        this.fastModel = params.fastModel || undefined;
        this.webSearchSettings = params.webSearch;
        this.visionModel = params.visionModel || undefined;
        this.compactionModel = params.compactionModel || undefined;
        this.imageModel = params.imageModel || undefined;
        // Guard: nothing validates settings.json on the load path, so this is the
        // only real gate. `AbortSignal.timeout()` requires an integer in
        // [0, 2^31-1] — a fractional or out-of-range value (which the number-typed
        // schema still accepts via /config) would throw RangeError or silently
        // degrade to a 1ms timeout, killing every bridge turn. Reject anything the
        // timer can't take and fall back to the built-in default.
        this.visionBridgeTimeoutMs =
            params.visionBridgeTimeoutMs !== undefined &&
                Number.isInteger(params.visionBridgeTimeoutMs) &&
                params.visionBridgeTimeoutMs > 0 &&
                params.visionBridgeTimeoutMs <= 2_147_483_647
                ? params.visionBridgeTimeoutMs
                : undefined;
        this.modelFallbacks = normalizeModelFallbacks(params.modelFallbacks);
        this.disableAllHooks = params.disableAllHooks ?? false;
        this.stopHookBlockingCap = resolveStopHookBlockingCap(params.stopHookBlockingCap);
        // Store user and project hooks separately for proper source attribution
        this.userHooks = params.userHooks;
        this.projectHooks = params.projectHooks;
        // Legacy: fall back to merged hooks if new fields are not provided
        this.hooks = params.hooks;
        this.settingsWatcher = params.settingsWatcher;
        this.memoryManager = new MemoryManager();
    }
    /**
     * Must only be called once, throws if called again.
     * @param options Optional initialization options including sendSdkMcpMessage callback
     */
    async initialize(options) {
        if (this.initialized) {
            throw Error('Config was already initialized');
        }
        if (this.shutdownRequested) {
            throw Error('Config is shutting down');
        }
        this.initialized = true;
        const initialization = this.initializeOnce(options);
        this.initializationPromise = initialization;
        try {
            await initialization;
            this.initializationSucceeded = true;
        }
        finally {
            this.initializationSettled = true;
        }
    }
    async initializeOnce(options) {
        try {
            const activation = this.activateChatRecording();
            this.sessionWriterActivationPromise = activation;
            try {
                await activation;
            }
            finally {
                if (this.sessionWriterActivationPromise === activation) {
                    this.sessionWriterActivationPromise = undefined;
                }
            }
            registerSessionProjectDir(this.sessionId, this.storage.getProjectDir());
            this.sessionProjectDirRegistered = true;
            await this.initializeInternal(options);
        }
        catch (error) {
            this.clearSessionRestoreProjection();
            if (this.sessionProjectDirRegistered) {
                unregisterSessionProjectDir(this.sessionId);
                this.sessionProjectDirRegistered = false;
            }
            try {
                await this.closeSessionWriter();
            }
            catch (closeError) {
                if (containsErrorByIdentity(error, closeError)) {
                    throw error;
                }
                throw new SessionWriterUnavailableError({
                    cause: new AggregateError([error, closeError], 'Chat recording close failed during failed initialization'),
                });
            }
            throw error;
        }
    }
    async initializeInternal(options) {
        this.debugLogger.info('Config initialization started');
        await this.proxyDispatcherReady;
        if (options?.skipFileCheckpointing === true) {
            this.fileCheckpointingEnabled = false;
            this.fileHistoryService = undefined;
        }
        // Initialize centralized FileDiscoveryService
        this.getFileService();
        this.promptRegistry = new PromptRegistry();
        this.resourceRegistry = new ResourceRegistry();
        this.extensionManager.setConfig(this);
        const explicitExtensionNames = this.isSafeMode()
            ? []
            : (this.overrideExtensions ?? []).filter((n) => n.trim() !== '' && n.toLowerCase() !== 'none');
        recordStartupEvent('config_initialize_extensions_initial_start');
        if (!this.isSafeMode() && !this.getBareMode()) {
            await this.extensionManager.refreshCache();
        }
        else if (!this.isSafeMode() && explicitExtensionNames.length > 0) {
            await this.extensionManager.refreshCache({
                names: explicitExtensionNames,
            });
        }
        recordStartupEvent('config_initialize_extensions_initial_end');
        this.debugLogger.debug('Extension manager initialized');
        // Bare mode and read-only replay helpers skip all hook loading and execution.
        recordStartupEvent('config_initialize_hooks_start');
        if (!options?.skipHooks && !this.getDisableAllHooks()) {
            this.hookSystem = new HookSystem(this);
            await this.hookSystem.initialize();
            this.debugLogger.debug('Hook system initialized');
            // Initialize MessageBus for hook execution
            this.messageBus = new MessageBus();
            // Subscribe to HOOK_EXECUTION_REQUEST to execute hooks
            this.messageBus.subscribe(MessageBusType.HOOK_EXECUTION_REQUEST, async (request) => {
                try {
                    const hookSystem = this.hookSystem;
                    if (!hookSystem) {
                        this.messageBus?.publish({
                            type: MessageBusType.HOOK_EXECUTION_RESPONSE,
                            correlationId: request.correlationId,
                            success: false,
                            error: new Error('Hook system not initialized'),
                        });
                        return;
                    }
                    // Check if request was aborted
                    if (request.signal?.aborted) {
                        this.messageBus?.publish({
                            type: MessageBusType.HOOK_EXECUTION_RESPONSE,
                            correlationId: request.correlationId,
                            success: false,
                            error: new Error('Hook execution cancelled (aborted)'),
                        });
                        return;
                    }
                    // Execute the appropriate hook based on eventName
                    let result;
                    let stopHookCount;
                    let hasNonGoalBlockingStopHook;
                    let nonGoalBlockingStopReason;
                    const input = request.input || {};
                    const signal = request.signal;
                    switch (request.eventName) {
                        case 'UserPromptSubmit':
                            result = await hookSystem.fireUserPromptSubmitEvent(input['prompt'] || '', signal, typeof input['submitted_prompt'] === 'string' &&
                                input['submitted_prompt'].trim().length > 0
                                ? input['submitted_prompt']
                                : undefined);
                            break;
                        case 'UserPromptExpansion':
                            result = await hookSystem.fireUserPromptExpansionEvent(input['command_name'] || '', input['command_args'] || '', input['prompt'] || '', signal);
                            break;
                        case 'Stop': {
                            // Extract context usage data from input with runtime validation
                            const contextUsageData = buildContextUsage(input['context_limit'], input['input_tokens'] ?? 0);
                            const stopResult = await hookSystem.fireStopEvent(input['stop_hook_active'] || false, input['last_assistant_message'] || '', contextUsageData, signal);
                            result = stopResult.finalOutput
                                ? createHookOutput('Stop', stopResult.finalOutput)
                                : undefined;
                            stopHookCount = stopResult.allOutputs.length;
                            const goalHookId = stopResult.finalOutput?.hookSpecificOutput?.[GOAL_HOOK_ID_OUTPUT_KEY];
                            if (typeof goalHookId === 'string') {
                                const nonGoalBlockingOutputs = stopResult.allOutputs.filter((output) => output.hookSpecificOutput?.[GOAL_HOOK_ID_OUTPUT_KEY] !==
                                    goalHookId &&
                                    (output.decision === 'block' ||
                                        output.decision === 'deny' ||
                                        output.continue === false));
                                hasNonGoalBlockingStopHook =
                                    nonGoalBlockingOutputs.length > 0;
                                if (hasNonGoalBlockingStopHook) {
                                    nonGoalBlockingStopReason = nonGoalBlockingOutputs
                                        .map((output) => output.stopReason ||
                                        output.reason ||
                                        'No reason provided')
                                        .join('\n');
                                }
                            }
                            break;
                        }
                        case 'MessageDisplay': {
                            const messageDisplayResult = await hookSystem.fireMessageDisplayEvent(input['message_id'] || '', input['displayed_text'] || '', input['is_final'] || false, signal);
                            result = messageDisplayResult.finalOutput
                                ? createHookOutput('MessageDisplay', messageDisplayResult.finalOutput)
                                : undefined;
                            break;
                        }
                        case 'PreToolUse': {
                            result = await hookSystem.firePreToolUseEvent(input['tool_name'] || '', input['tool_input'] || {}, input['tool_use_id'] || '', input['permission_mode'] ??
                                PermissionMode.Default, signal, input['tool_call_id'] || undefined);
                            break;
                        }
                        case 'PostToolUse':
                            result = await hookSystem.firePostToolUseEvent(input['tool_name'] || '', input['tool_input'] || {}, input['tool_response'] || {}, input['tool_use_id'] || '', input['permission_mode'] || 'default', signal, input['tool_call_id'] || undefined);
                            break;
                        case 'PostToolUseFailure':
                            result = await hookSystem.firePostToolUseFailureEvent(input['tool_use_id'] || '', input['tool_name'] || '', input['tool_input'] || {}, input['error'] || '', input['is_interrupt'], input['permission_mode'] || 'default', signal, input['tool_call_id'] || undefined);
                            break;
                        case 'PostToolBatch':
                            result = await hookSystem.firePostToolBatchEvent(input['tool_calls'] || [], input['permission_mode'] || 'default', signal);
                            break;
                        case 'Notification':
                            result = await hookSystem.fireNotificationEvent(input['message'] || '', input['notification_type'] ||
                                'permission_prompt', input['title'] || undefined, signal);
                            break;
                        case 'PermissionRequest':
                            result = await hookSystem.firePermissionRequestEvent(input['tool_name'] || '', input['tool_input'] || {}, input['permission_mode'] ||
                                PermissionMode.Default, input['permission_suggestions'] || undefined, signal);
                            break;
                        case 'PermissionDenied':
                            result = await hookSystem.firePermissionDeniedEvent(input['tool_name'] || '', input['tool_input'] || {}, input['tool_use_id'] || '', input['reason'] ||
                                'classifier_blocked', signal, input['tool_call_id'] || undefined);
                            break;
                        case 'SubagentStart':
                            result = await hookSystem.fireSubagentStartEvent(input['agent_id'] || '', input['agent_type'] || '', input['permission_mode'] ||
                                PermissionMode.Default, signal);
                            break;
                        case 'SubagentStop':
                            result = await hookSystem.fireSubagentStopEvent(input['agent_id'] || '', input['agent_type'] || '', input['agent_transcript_path'] || '', input['last_assistant_message'] || '', input['stop_hook_active'] || false, input['permission_mode'] ||
                                PermissionMode.Default, signal);
                            break;
                        default:
                            this.debugLogger.warn(`Unknown hook event: ${request.eventName}`);
                            result = undefined;
                    }
                    // Send response
                    this.messageBus?.publish({
                        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
                        correlationId: request.correlationId,
                        success: true,
                        output: result,
                        // Include stop hook count for Stop events
                        stopHookCount,
                        hasNonGoalBlockingStopHook,
                        nonGoalBlockingStopReason,
                    });
                }
                catch (error) {
                    this.debugLogger.warn(`Hook execution failed: ${error}`);
                    this.messageBus?.publish({
                        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
                        correlationId: request.correlationId,
                        success: false,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            });
            this.debugLogger.debug('MessageBus initialized with hook subscription');
        }
        else {
            this.debugLogger.debug('Hook system disabled, skipping initialization');
        }
        recordStartupEvent('config_initialize_hooks_end');
        this.subagentManager = new SubagentManager(this);
        recordStartupEvent('config_initialize_skills_start');
        if (!options?.skipSkillManager) {
            if (this.getAutoSkillEnabled() && this.isTrustedFolder()) {
                try {
                    const curatorResult = await maybeRunAutoSkillCurator(this.getProjectRoot());
                    if (curatorResult.status === 'ran') {
                        this.debugLogger.debug(`Auto-skill curator checked ${curatorResult.result.checked} skill(s) and archived ${curatorResult.result.archived.length}.`);
                    }
                }
                catch (error) {
                    this.debugLogger.warn(`Auto-skill curator skipped: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            this.skillManager = new SkillManager(this);
            if (this.getBareMode() || this.isSafeMode()) {
                await this.skillManager.refreshCache();
            }
            else {
                await this.skillManager.startWatching();
            }
            this.debugLogger.debug('Skill manager initialized');
        }
        else {
            this.skillManager = null;
            this.debugLogger.debug('Skill manager skipped');
        }
        recordStartupEvent('config_initialize_skills_end');
        this.memoryPressureConfig = loadMemoryPressureConfig();
        this.memoryPressureMonitor = new MemoryPressureMonitor(this, this.memoryPressureConfig);
        this.permissionManager = new PermissionManager(this);
        this.permissionManager.initialize();
        this.debugLogger.debug('Permission manager initialized');
        // Load session subagents if they were provided before initialization
        if (this.sessionSubagents.length > 0) {
            this.subagentManager.loadSessionSubagents(this.sessionSubagents);
        }
        recordStartupEvent('config_initialize_extensions_final_start');
        if (!this.getBareMode() && !this.isSafeMode()) {
            await this.extensionManager.refreshCache();
        }
        recordStartupEvent('config_initialize_extensions_final_end');
        recordStartupEvent('config_initialize_hierarchical_memory_start');
        await this.refreshHierarchicalMemory('session_start');
        recordStartupEvent('config_initialize_hierarchical_memory_end');
        this.debugLogger.debug('Hierarchical memory loaded');
        // Progressive MCP availability: skip MCP discovery in the synchronous
        // tool-registry construction path and kick it off in the background
        // after the registry exists. This lets `Config.initialize()` (and the
        // cli's `input_enabled` checkpoint) resolve without waiting on MCP
        // server response time. Users can opt back into the legacy synchronous
        // behavior with `QWEN_CODE_LEGACY_MCP_BLOCKING=1` — kept ≥ 1 release as
        // an escape hatch.
        const legacyBlockingMcp = process.env['QWEN_CODE_LEGACY_MCP_BLOCKING'] === '1';
        // Also force the inline-discovery skip when the caller opts
        // out of MCP entirely (ACP bootstrap path) — otherwise the legacy
        // blocking mode would still spawn MCP servers via the tool-registry
        // construction path.
        const skipInlineMcpDiscovery = this.getBareMode() ||
            this.isSafeMode() ||
            !legacyBlockingMcp ||
            options?.skipMcpDiscovery === true;
        recordStartupEvent('config_initialize_tool_registry_start');
        this.toolRegistry = await this.createToolRegistry(options?.sendSdkMcpMessage, skipInlineMcpDiscovery ? { skipDiscovery: true } : undefined);
        recordStartupEvent('config_initialize_tool_registry_end');
        recordStartupEvent('tool_registry_created', {
            toolCount: this.toolRegistry.getAllToolNames().length,
            mcpInline: !skipInlineMcpDiscovery,
        });
        this.debugLogger.info(`Tool registry initialized with ${this.toolRegistry.getAllToolNames().length} tools`);
        if (!options?.skipGeminiInitialization) {
            await this.geminiClient.initialize();
            this.debugLogger.info('Gemini client initialized');
        }
        else {
            this.debugLogger.info('Gemini client initialization skipped');
        }
        // Detect and capture runtime model snapshot (from CLI/ENV/credentials)
        this.modelsConfig.detectAndCaptureRuntimeModel();
        // Warm all lazy tool factories so telemetry can access tool metadata synchronously.
        // Strict by default so a broken built-in tool surfaces immediately at startup;
        // read-only replay Configs pass `lenientToolWarmup` so a tool that cannot be
        // constructed under their deliberately-skipped subsystems (e.g. SkillTool without
        // a SkillManager) is logged and skipped instead of aborting initialize().
        recordStartupEvent('config_initialize_tool_warmup_start');
        await this.toolRegistry.warmAll({
            strict: options?.lenientToolWarmup !== true,
        });
        recordStartupEvent('config_initialize_tool_warmup_end');
        // Fire-and-forget MCP discovery. Each server's tools land in the
        // registry as it becomes ready; the cli's AppContainer debounces
        // `setTools()` (~16ms / one frame) so the model sees the new tools
        // shortly after each server settles. See `AppContainer.tsx`'s
        // `mcp-client-update` subscriber.
        //
        // Also gated on `!options?.skipMcpDiscovery` — the ACP
        // bootstrap path passes `skipMcpDiscovery: true` so the bootstrap
        // config doesn't run discovery under its pool-less manager.
        //
        // Safe/bare mode still skip discovery when there's nothing to discover
        // (the common case: no top-tier servers supplied) — this block predates
        // the safe-mode `getMcpServers()` fix (PR #7827) and was written when
        // `getMcpServers()` always returned `{}` under both modes, making the
        // unconditional skip a harmless no-op regardless. Now that
        // caller-supplied top-tier servers survive safe mode AND bare mode,
        // unconditionally skipping discovery in either would silently strand
        // them: `getMcpServers()` reports them as configured, but nothing ever
        // connects to them or registers their tools (a live repro of exactly
        // this — `qwen --bare --mcp-config` with a top-tier server — surfaced
        // the bare-mode half of this gate was never updated alongside safe
        // mode's). Checking `getMcpServers()` (not `topTierMcpServers` directly)
        // also respects the `allowedMcpServers` filter already applied there.
        const hasMcpServers = Object.keys(this.getMcpServers() ?? {}).length > 0;
        if (skipInlineMcpDiscovery &&
            (!(this.getBareMode() || this.isSafeMode()) || hasMcpServers) &&
            !options?.skipMcpDiscovery) {
            this.startMcpDiscoveryInBackground();
        }
        logStartSession(this, new StartSessionEvent(this));
        this.debugLogger.info('Config initialization completed');
        // Fire-and-forget sweep of stale ephemeral worktrees left behind by
        // earlier `agent` runs that exited before their cleanup helper ran
        // (Ctrl-C, process crash, abrupt shutdown). The sweep only touches
        // `agent-<7hex>` slugs, skips anything newer than 30 days, and
        // is fail-closed against tracked changes or unpushed commits — so
        // running it on every startup cannot destroy user work. We do not
        // await this: it is a hygiene task that must never delay the
        // first model turn.
        //
        // Anchor the sweep at the repo top-level so it scans the same
        // directory the worktree creators (`enter_worktree` and
        // `agent isolation:'worktree'`) write to. Using `this.targetDir`
        // directly would cause launches from a monorepo subdirectory to
        // scan `<subdir>/.lailatulcoder/worktrees/` — which never exists — and the
        // sweep would silently be a no-op forever.
        if (!this.getBareMode()) {
            void (async () => {
                try {
                    // Resolve the repo top-level FIRST. The previous code bailed
                    // on `fs.access(<targetDir>/.lailatulcoder/worktrees)` before resolving,
                    // so a monorepo subdir launch (where `targetDir` is the
                    // subdir, not the repo root) always early-returned and the
                    // sweep was permanently a no-op. Fast-bail still happens, just
                    // against the *correct* directory.
                    const root = findGitRoot(this.targetDir) ?? this.targetDir;
                    const worktreesDir = path.join(root, '.lailatulcoder', 'worktrees');
                    try {
                        await fsPromises.access(worktreesDir);
                    }
                    catch {
                        // Skipped (no worktrees dir) is the common-case happy
                        // path on every CLI start for ~99% of users. `debug` so
                        // operators can opt in via `--debug` when they actually
                        // want to confirm the sweep is wired up — `info` would
                        // be log noise.
                        this.debugLogger.debug(`Stale worktree sweep skipped: ${worktreesDir} does not exist`);
                        return;
                    }
                    const removed = await cleanupStaleAgentWorktrees(root);
                    if (removed > 0) {
                        // Only the "actually removed something" path warrants
                        // `info` — that's the signal an operator chasing a leak
                        // would grep for. The "ran, found nothing" path is
                        // reconstructable at `debug` and is otherwise noise:
                        // every CLI start that has any worktree dir would emit
                        // it, drowning the actually-actionable message.
                        this.debugLogger.info(`Stale worktree sweep removed ${removed} ephemeral worktree(s) under ${root}`);
                    }
                    else {
                        this.debugLogger.debug(`Stale worktree sweep ran under ${root}: nothing to remove`);
                    }
                }
                catch (error) {
                    // Promote sweep errors to `warn` for the same reason: a
                    // permission failure / disk full / repo-corruption case
                    // should leave a visible breadcrumb instead of being
                    // invisible at the default log level.
                    this.debugLogger.warn(`Stale worktree sweep failed (non-fatal): ${error}`);
                }
            })();
        }
    }
    async activateChatRecording() {
        if (!this.chatRecordingEnabled || !this.sessionWriterLeaseEnabled) {
            return;
        }
        if (this.sessionWriterShutdownRequested) {
            throw new SessionWriterShutdownError();
        }
        const recorder = this.chatRecordingService;
        if (!recorder)
            throw new SessionWriterUnavailableError();
        let lease;
        try {
            lease = await SessionWriterLease.acquire({
                runtimeBaseDir: this.sessionRuntimeBaseDir,
                sessionId: this.sessionId,
                transcriptPath: this.getTranscriptPath(),
                processKind: 'acp',
                qwenVersion: this.cliVersion ?? null,
                reclaimPolicy: this.sessionWriterReclaimPolicy,
                takeoverPolicy: this.sessionWriterTakeoverPolicy,
                onOwnershipAcquired: (acquiredLease) => {
                    lease = acquiredLease;
                    this.pendingSessionWriterLease = acquiredLease;
                    if (this.sessionWriterShutdownRequested) {
                        this.startPendingSessionWriterRelease(acquiredLease);
                    }
                },
            });
            if (this.sessionWriterShutdownRequested) {
                throw new SessionWriterShutdownError();
            }
            const location = await this.getSessionService().getSessionLocation(this.sessionId);
            if (this.sessionWriterShutdownRequested) {
                throw new SessionWriterShutdownError();
            }
            if (location === 'conflict' || location === 'archived') {
                throw new SessionTranscriptChangedError();
            }
            let authoritative;
            let projection;
            if (this.sessionRestoreProjectionSource) {
                addDaemonRequestAttribute('lailatul-coder.daemon.session_restore.projection_acquisition', 'after_writer_lease');
                projection = await this.sessionRestoreProjectionSource();
                this.setSessionRestoreProjection(projection);
            }
            else if (this.sessionData || lease.transcriptExistedAtAcquire) {
                authoritative = await this.getSessionService().loadSession(this.sessionId);
                if (!authoritative)
                    throw new SessionWriterUnavailableError();
            }
            else if (location !== undefined) {
                throw new SessionTranscriptChangedError();
            }
            const persistedTitleInfo = authoritative
                ? this.getSessionService().getSessionTitleInfo(this.sessionId)
                : undefined;
            await lease.assertOwnedAndUnchanged();
            if (this.sessionWriterShutdownRequested) {
                throw new SessionWriterShutdownError();
            }
            this.sessionData = authoritative;
            recorder.activate(lease, authoritative, persistedTitleInfo, projection?.runtime.recording);
            if (this.sessionRestoreProjectionSource) {
                this.initializeGoalRuntime(projection?.runtime.goalRecords, projection?.runtime);
            }
            this.pendingSessionWriterLease = undefined;
            lease = undefined;
            // The recorder can take writes now, so the restore the constructor
            // held back can finally run — against `authoritative`, which is
            // fresher than what the constructor had. Not awaited: activation
            // latency is unchanged, and `getGoalRuntimeReady()` is what waits.
            this.startPendingGoalRestore();
        }
        catch (error) {
            let failure = error;
            if (!(failure instanceof SessionWriterError) &&
                failure &&
                typeof failure === 'object' &&
                typeof failure.code === 'string') {
                failure = new SessionWriterUnavailableError({ cause: failure });
            }
            try {
                const ownedLease = lease ?? this.pendingSessionWriterLease;
                await this.startPendingSessionWriterRelease(ownedLease);
                if (this.pendingSessionWriterLease === ownedLease &&
                    (ownedLease?.isReleased ?? true)) {
                    this.pendingSessionWriterLease = undefined;
                }
                if (this.sessionWriterShutdownRequested &&
                    failure instanceof SessionWriterLostError &&
                    ownedLease?.isReleased) {
                    failure = new SessionWriterShutdownError();
                }
            }
            catch (releaseError) {
                if (releaseError instanceof SessionWriterLostError ||
                    (lease ?? this.pendingSessionWriterLease)?.isReleased) {
                    this.pendingSessionWriterLease = undefined;
                }
                else if (!containsErrorByIdentity(failure, releaseError)) {
                    failure = new SessionWriterUnavailableError({
                        cause: new AggregateError([failure, releaseError], 'Session writer lease release failed during activation cleanup'),
                    });
                }
            }
            // The writer never became available, so the deferred restore can never
            // run. Fail it with the activation error instead of leaving every
            // `getGoalRuntimeReady()` caller pending forever.
            this.settlePendingGoalRestore(failure);
            throw failure;
        }
    }
    /**
     * In-flight background MCP discovery promise. Captured so non-interactive
     * code paths can await it before invoking the model (see
     * {@link waitForMcpReady}). Undefined when MCP discovery was skipped
     * entirely (bare mode, legacy blocking mode, or no MCP servers).
     */
    mcpDiscoveryPromise;
    /**
     * Kicks off MCP server discovery in the background after the synchronous
     * portion of {@link initialize} returns. Errors are logged, never thrown:
     * a broken MCP server must not bring down the cli, and per-server
     * connect/discover failures are already surfaced through the
     * `mcp-client-update` event stream the UI subscribes to.
     *
     * Defensive against partially-stubbed `ToolRegistry` in some tests, where
     * the manager getter is unavailable — we'd rather log-and-skip than crash
     * the init path in tests that don't exercise MCP at all.
     */
    startMcpDiscoveryInBackground() {
        // `getMcpClientManager` is a public method on `ToolRegistry`. The
        // cast below is NOT defensive against the production type — it
        // exists only because some tests (e.g. those using
        // `createMockToolRegistry`) stub `ToolRegistry` as a plain object
        // that doesn't implement the method. The optional-chaining call
        // (`?.()`) means the stubbed path resolves to `undefined` instead
        // of crashing `initialize()` for tests that never exercise MCP.
        //
        // Crucially, the inner shape is `ReturnType<ToolRegistry['getMcpClientManager']>`
        // — not a hand-rolled `{ discoverAllMcpToolsIncremental: ... }` — so
        // a future rename of `getMcpClientManager` on `ToolRegistry` still
        // surfaces here as a type error rather than silently falling
        // through to the `if (!manager) return` branch.
        const manager = this.toolRegistry.getMcpClientManager?.();
        if (!manager) {
            this.debugLogger.debug('Skipping background MCP discovery: ToolRegistry has no MCP client manager');
            return;
        }
        this.mcpDiscoveryPromise = manager
            .discoverAllMcpToolsIncremental(this)
            .then(async () => {
            // After background discovery completes, push the newly-registered
            // MCP tools into the active GeminiChat so the next model request
            // sees both the updated declarations and added-tool reminder deltas.
            // Interactive mode also calls setTools() via AppContainer's
            // batch-flush effect — this trailing call is idempotent there, but
            // it's the ONLY path that updates `chat.tools` for non-interactive
            // runs (no AppContainer).
            // Without this, `chat.tools` would be frozen at the built-in-only
            // snapshot taken inside `geminiClient.initialize()` → `startChat()`,
            // and `runNonInteractive` / stream-json / ACP would silently lose
            // progressive MCP tools — a regression vs the legacy synchronous path.
            try {
                await this.geminiClient?.setTools();
            }
            catch (err) {
                this.debugLogger.error(`setTools() after background MCP discovery failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        })
            .catch((err) => {
            this.debugLogger.error(`Background MCP discovery failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
    /**
     * Resolves when background MCP discovery has settled (all servers ready,
     * failed, or timed out). Non-interactive code paths (`runNonInteractive`,
     * stream-json, ACP) MUST await this before invoking the model so the
     * first model request sees the same tool surface the legacy
     * synchronous-MCP path produced.
     *
     * Interactive code paths should NOT call this — `AppContainer`'s
     * `mcp-client-update` subscriber handles `setTools()` refreshes
     * progressively without blocking the UI.
     *
     * Resolves immediately when:
     * - bare mode is on (no MCP discovery is started),
     * - `QWEN_CODE_LEGACY_MCP_BLOCKING=1` is set (MCP already discovered
     *   synchronously inside {@link initialize}), or
     * - no MCP servers are configured.
     */
    async waitForMcpReady() {
        if (this.mcpDiscoveryPromise) {
            await this.mcpDiscoveryPromise;
        }
    }
    /**
     * Returns the names of configured (non-disabled) MCP servers whose
     * discovery did NOT end in a CONNECTED state. Intended to be called by
     * non-interactive entry points AFTER {@link waitForMcpReady} resolves,
     * so they can surface a single user-visible warning summarizing which
     * servers failed.
     *
     * The legacy synchronous MCP path surfaced these failures visibly
     * during `config.initialize()` (because they happened on the main
     * thread and per-server errors logged to stderr). Under PR-A's
     * progressive discovery, per-server errors are caught inside
     * `McpClientManager.discoverAllMcpToolsIncremental` and routed to
     * profiler events + `mcp-client-update` notifications — both of which
     * are invisible to a non-interactive run with only built-in stderr.
     * This helper closes that gap WITHOUT re-introducing the blocking
     * behavior.
     *
     * Returns an empty array when MCP discovery was skipped (bare mode /
     * legacy blocking / no servers configured) or when every configured
     * server settled successfully.
     */
    getFailedMcpServerNames() {
        const servers = this.getMcpServers();
        if (!servers) {
            return [];
        }
        const failed = [];
        for (const name of Object.keys(servers)) {
            if (this.isMcpServerDisabled(name)) {
                continue;
            }
            if (this.isMcpServerPendingApproval(name)) {
                continue;
            }
            if (getMCPServerStatus(name) !== MCPServerStatus.CONNECTED) {
                failed.push(name);
            }
        }
        return failed;
    }
    async refreshHierarchicalMemory(loadReason = 'refresh') {
        // Safe mode: skip all context file loading (QWEN.md, AGENTS.md, rules)
        if (this.isSafeMode()) {
            this.setUserMemory('');
            this.autoMemoryPrompt = '';
            this.setGeminiMdFileCount(0);
            this.setContextFilePaths([]);
            this.conditionalRulesRegistry = new ConditionalRulesRegistry([], this.getWorkingDir());
            return;
        }
        const { memoryContent, fileCount, contextFilePaths, conditionalRules, projectRoot, } = await loadServerHierarchicalMemory(this.getWorkingDir(), this.getMemoryDiscoveryDirectories(), this.getFileService(), this.getExtensionContextFilePaths(), this.isTrustedFolder(), this.getImportFormat(), this.contextRuleExcludes, {
            explicitOnly: this.getBareMode(),
            loadReason,
            onInstructionsLoaded: createInstructionsLoadedCallback(() => this.hookSystem),
        });
        if (this.isManagedMemoryAvailable()) {
            // User-level read is best-effort — an EACCES on
            // `~/.lailatulcoder/memories/MEMORY.md` must not strip the whole managed-memory
            // section out of the system prompt. Project-level read still bubbles
            // (its failure is a real config-load problem).
            const teamMemoryEnabled = this.getTeamMemoryEnabled() && this.isTrustedFolder();
            if (this.getTeamMemoryEnabled() && !this.isTrustedFolder()) {
                // Surface why team memory is silently absent from the prompt.
                this.debugLogger.debug('Team memory enabled but inactive: workspace is not trusted.');
            }
            const teamProjectRoot = this.getProjectRoot();
            // When the tier is active, warn (once per repo) if its directory is not
            // actually git-shareable — no git root, or a directory-form .gitignore
            // swallowing it — so the tier never silently shares nothing.
            if (teamMemoryEnabled &&
                !this.teamMemoryShareabilityChecked.has(teamProjectRoot)) {
                this.teamMemoryShareabilityChecked.add(teamProjectRoot);
                const shareabilityWarning = getTeamMemoryShareabilityWarning(teamProjectRoot);
                if (shareabilityWarning) {
                    this.warnings.push(shareabilityWarning);
                    this.debugLogger.warn(shareabilityWarning);
                }
            }
            // Rebuild the team index BEFORE syncing so the freshly generated MEMORY.md
            // is what gets committed and pushed, not a stale one. Then, when opted in,
            // best-effort git sync (never throws — a failure must not break session
            // start): pull collaborators' updates and push local ones. If the sync
            // PULLED new files, rebuild once more so the in-prompt index reflects them.
            let teamAutoMemoryIndex = null;
            if (teamMemoryEnabled) {
                // rebuildTeamAutoMemoryIndex throws for two distinct classes, and only
                // ONE may block sync:
                //   • SECURITY — a symlink/escape rejection (TeamMemoryRootSecurityError)
                //     means the team root could redirect the committed index OUTSIDE the
                //     repo. Sync MUST be blocked: otherwise syncTeamMemory would git
                //     add/commit/push that out-of-repo dir, defeating the indexer's
                //     refusal. This invariant is non-negotiable.
                //   • OPERATIONAL — EACCES/ENOSPC/EPERM on lstat/readdir/write. Not a
                //     security problem, so it must NOT permanently gate legitimate sync;
                //     it self-corrects on the next successful rebuild. Log and sync on.
                let teamRootSecurityBlocked = false;
                try {
                    teamAutoMemoryIndex =
                        await rebuildTeamAutoMemoryIndex(teamProjectRoot);
                }
                catch (err) {
                    if (err instanceof TeamMemoryRootSecurityError) {
                        teamRootSecurityBlocked = true;
                        this.debugLogger.warn('team memory root failed the symlink/escape safety check; skipping sync', err);
                    }
                    else {
                        this.debugLogger.warn('team memory index rebuild failed (operational); not security-gating sync', err);
                    }
                }
                if (!teamRootSecurityBlocked && this.getTeamMemorySyncEnabled()) {
                    const syncResult = await syncTeamMemory(teamProjectRoot, {
                        message: 'chore(memory): sync team memory',
                    }).catch((err) => {
                        this.debugLogger.warn('team memory sync failed', err);
                        return undefined;
                    });
                    // Surface the silent no-op: the user opted into sync but, e.g., the
                    // repo has no upstream, so nothing is shared. Debug-level — not every
                    // session should warn loudly, but an operator can see why sync did
                    // nothing.
                    if (syncResult?.skippedReason) {
                        this.debugLogger.warn(`team memory sync skipped: ${syncResult.skippedReason}`);
                    }
                    if (syncResult?.pulled) {
                        teamAutoMemoryIndex = await rebuildTeamAutoMemoryIndex(teamProjectRoot).catch(() => teamAutoMemoryIndex);
                    }
                }
            }
            const [managedAutoMemoryIndexRead, userAutoMemoryIndexRead] = await Promise.all([
                readAutoMemoryIndexWithStats(this.getProjectRoot()),
                readUserAutoMemoryIndexWithStats().catch(() => null),
            ]);
            this.recordAutoMemoryIndexRead(getAutoMemoryIndexPath(this.getProjectRoot()), managedAutoMemoryIndexRead);
            this.recordAutoMemoryIndexRead(getUserAutoMemoryIndexPath(), userAutoMemoryIndexRead);
            const managedAutoMemoryIndex = managedAutoMemoryIndexRead?.content ?? null;
            const userAutoMemoryIndex = userAutoMemoryIndexRead?.content ?? null;
            // Always surface the user-level section so the main assistant knows the
            // dir exists and can route ad-hoc "remember this cross-project" saves
            // there. When empty the prompt builder emits a "MEMORY.md is currently
            // empty" placeholder — the same shape the per-project layer has used
            // since day one — so the cost is one extra index header.
            this.setUserMemory(memoryContent);
            this.autoMemoryPrompt = this.memoryManager.buildAutoMemoryPrompt(getAutoMemoryRoot(this.getProjectRoot()), managedAutoMemoryIndex, {
                memoryDir: getUserAutoMemoryRoot(),
                indexContent: userAutoMemoryIndex,
            }, teamMemoryEnabled
                ? {
                    memoryDir: getTeamAutoMemoryRoot(this.getProjectRoot()),
                    indexContent: teamAutoMemoryIndex,
                }
                : undefined);
        }
        else {
            this.setUserMemory(memoryContent);
            this.autoMemoryPrompt = '';
        }
        this.setGeminiMdFileCount(fileCount);
        this.setContextFilePaths(contextFilePaths);
        this.conditionalRulesRegistry = new ConditionalRulesRegistry(conditionalRules, projectRoot);
    }
    recordAutoMemoryIndexRead(indexPath, indexRead) {
        if (indexRead === null || this.getFileReadCacheDisabled()) {
            return;
        }
        this.getFileReadCache().recordRead(indexPath, indexRead.stats, {
            full: true,
            cacheable: true,
        });
    }
    buildMemoryContextWarning(memoryContent) {
        const contextWindowSize = this.getContentGeneratorConfig()?.contextWindowSize ??
            this.modelsConfig.getGenerationConfig().contextWindowSize ??
            tokenLimit(this.getModel(), 'input');
        if (!contextWindowSize || contextWindowSize <= 0 || !memoryContent) {
            return undefined;
        }
        const estimatedTokens = Math.ceil(memoryContent.length / CHARS_PER_TOKEN);
        const thresholdTokens = Math.floor(contextWindowSize * MEMORY_CONTEXT_WARNING_RATIO);
        if (estimatedTokens <= thresholdTokens) {
            return undefined;
        }
        return (`Warning: Loaded always-on context (QWEN.md context files + auto-memory) uses about ` +
            `${estimatedTokens.toLocaleString()} tokens, more than ` +
            `${Math.round(MEMORY_CONTEXT_WARNING_RATIO * 100)}% of this ` +
            `model's ${contextWindowSize.toLocaleString()} token context window. ` +
            `Consider trimming long always-loaded context or moving details into ` +
            `on-demand files.`);
    }
    getMemoryDiscoveryDirectories() {
        if (!this.shouldLoadMemoryFromIncludeDirectories()) {
            return [];
        }
        if (this.getBareMode()) {
            return this.explicitIncludeDirectories;
        }
        return [...this.getWorkspaceContext().getDirectories()];
    }
    getConditionalRulesRegistry() {
        return this.conditionalRulesRegistry;
    }
    /**
     * Update the conditional rules registry. Called after external refresh
     * paths (e.g. /memory refresh or /directory add) that bypass
     * refreshHierarchicalMemory().
     */
    setConditionalRulesRegistry(registry) {
        this.conditionalRulesRegistry = registry;
    }
    getContextRuleExcludes() {
        return this.contextRuleExcludes;
    }
    getContentGenerator() {
        return (getRuntimeContentGenerator()?.contentGenerator ?? this.contentGenerator);
    }
    /**
     * Get the ModelsConfig instance for model-related operations.
     * External code (e.g., CLI) can use this to access model configuration.
     */
    getModelsConfig() {
        return this.modelsConfig;
    }
    /**
     * Updates the credentials in the generation config.
     * Exclusive for `OpenAIKeyPrompt` to update credentials via `/auth`
     * Delegates to ModelsConfig.
     */
    updateCredentials(credentials, settingsGenerationConfig) {
        this.modelsConfig.updateCredentials(credentials, settingsGenerationConfig);
    }
    /**
     * Reload model providers configuration at runtime.
     * This enables hot-reloading of modelProviders settings without restarting the CLI.
     * Should be called before refreshAuth when settings.json has been updated.
     *
     * @param modelProvidersConfig - The updated model providers configuration
     * @param providerProtocolConfig - Updated provider->protocol map; `undefined`
     *   preserves the existing map (see {@link ModelRegistry.reloadModels}).
     */
    reloadModelProvidersConfig(modelProvidersConfig, providerProtocolConfig) {
        this.modelsConfig.reloadModelProvidersConfig(modelProvidersConfig, providerProtocolConfig);
        this.baseLlmClient?.clearPerModelGeneratorCache();
    }
    /**
     * Refresh authentication and rebuild ContentGenerator.
     */
    async refreshAuth(authMethod, isInitialAuth) {
        // The global reasoning effort (settings.model.reasoningEffort, seeded into
        // the generation config by the CLI) is NOT a provider field, but
        // syncAfterAuthRefresh → applyResolvedModelDefaults overwrites every
        // MODEL_GENERATION_CONFIG_FIELDS entry — including `reasoning` — with the
        // provider preset's value (undefined for reasoning). Capture the effort
        // before the sync wipes it and re-apply it after the config is rebuilt, so
        // /effort survives an auth refresh, including the initial one at startup.
        // `reasoning` is `false | { effort?, ... } | undefined`; the truthy check
        // already excludes both `false` and `undefined`.
        const priorReasoning = this.modelsConfig.getGenerationConfig().reasoning;
        const priorReasoningEffort = priorReasoning
            ? priorReasoning.effort
            : undefined;
        // Sync modelsConfig state for this auth refresh
        const modelId = this.modelsConfig.getModel();
        this.modelsConfig.syncAfterAuthRefresh(authMethod, modelId);
        // Check and consume cached credentials flag
        const requireCached = this.modelsConfig.consumeRequireCachedCredentialsFlag();
        const { config, sources } = resolveContentGeneratorConfigWithSources(this, authMethod, this.modelsConfig.getGenerationConfig(), this.modelsConfig.getGenerationConfigSources(), {
            strictModelProvider: this.modelsConfig.isStrictModelProviderSelection(),
        });
        const newContentGeneratorConfig = config;
        this.contentGenerator = await createContentGenerator(newContentGeneratorConfig, this, requireCached ? true : isInitialAuth);
        // Only assign to instance properties after successful initialization
        this.contentGeneratorConfig = newContentGeneratorConfig;
        this.contentGeneratorConfigSources = sources;
        // Auth flows call refreshAuth directly — no model-change notification
        // fires — and the resolved model can differ from the pre-auth one.
        this.publishModelEnv();
        // Re-apply the user's reasoning effort that the provider sync above wiped.
        if (priorReasoningEffort) {
            this.setReasoningEffort(priorReasoningEffort);
        }
        // Initialize BaseLlmClient now that the ContentGenerator is available
        this.baseLlmClient = new BaseLlmClient(this.contentGenerator, this);
        // Fire auth_success notification hook (supports both interactive & non-interactive)
        const messageBus = this.getMessageBus();
        const hooksEnabled = !this.getDisableAllHooks();
        if (hooksEnabled && messageBus) {
            fireNotificationHook(messageBus, `Successfully authenticated with ${authMethod}`, NotificationType.AuthSuccess, 'Authentication successful').catch(() => {
                // Silently ignore errors - fireNotificationHook has internal error handling
                // and notification hooks should not block the auth flow
            });
        }
    }
    /**
     * Provides access to the BaseLlmClient for stateless LLM operations.
     */
    getBaseLlmClient() {
        if (!this.baseLlmClient) {
            // Handle cases where initialization might be deferred or authentication failed
            if (this.contentGenerator) {
                this.baseLlmClient = new BaseLlmClient(this.getContentGenerator(), this);
            }
            else {
                throw new Error('BaseLlmClient not initialized. Ensure authentication has occurred and ContentGenerator is ready.');
            }
        }
        return this.baseLlmClient;
    }
    getSessionId() {
        return this.sessionId;
    }
    getSessionRestoreRuntime() {
        return this.sessionRestoreRuntime;
    }
    consumeSessionRestoreProjection() {
        const projection = this.pendingSessionRestoreProjection;
        this.pendingSessionRestoreProjection = undefined;
        return projection;
    }
    hydrateSessionRestoreFileHistory() {
        if (this.restoredFileHistory)
            return;
        const snapshots = this.sessionRestoreRuntime?.fileHistorySnapshots;
        if (!snapshots?.length)
            return;
        const service = this.getFileHistoryService();
        if (!service.isEnabled())
            return;
        service.restoreFromSnapshots(snapshots);
        this.restoredFileHistory = true;
    }
    finalizeSessionRestore() {
        const runtime = this.sessionRestoreRuntime;
        if (!runtime)
            return;
        this.sessionRestoreRuntime = undefined;
        if (runtime.attributionSnapshot) {
            try {
                CommitAttributionService.getInstance().restoreFromSnapshot(runtime.attributionSnapshot);
            }
            catch (error) {
                this.debugLogger.error(`Session restore attribution activation failed: ${error}`);
            }
        }
        const activateGoal = this.goalRestoreActivation;
        this.goalRestoreActivation = undefined;
        this.rejectGoalRestoreActivation = undefined;
        if (activateGoal) {
            try {
                void activateGoal().catch((error) => {
                    this.debugLogger.error(`Session restore goal activation failed: ${error}`);
                });
            }
            catch (error) {
                this.debugLogger.error(`Session restore goal activation failed: ${error}`);
            }
        }
        if (this.restoredFileHistory && this.fileHistoryService) {
            try {
                void this.fileHistoryService
                    .validateRestoredSnapshots()
                    .catch((error) => {
                    this.debugLogger.error(`FileHistory: validateRestoredSnapshots failed: ${error}`);
                });
            }
            catch (error) {
                this.debugLogger.error(`FileHistory: validateRestoredSnapshots failed: ${error}`);
            }
        }
    }
    setSessionSource(sourceType, sourceId) {
        this.sessionSourceType = sourceType;
        this.sessionSourceId = sourceId;
    }
    getSessionSourceType() {
        return this.sessionSourceType;
    }
    getSessionSourceId() {
        return this.sessionSourceId;
    }
    /**
     * Returns warnings generated during configuration resolution.
     * These warnings are collected from model configuration resolution
     * and should be displayed to the user during startup.
     */
    getWarnings() {
        // Both layers are always loaded into the system prompt, so the size
        // estimate must cover context files and the auto-memory section alike.
        const memoryContextWarning = this.buildMemoryContextWarning([this.getUserMemory(), this.autoMemoryPrompt]
            .filter(Boolean)
            .join('\n\n'));
        return memoryContextWarning
            ? [...this.warnings, memoryContextWarning]
            : this.warnings;
    }
    getDebugLogger() {
        return this.debugLogger;
    }
    /**
     * Starts a new session and resets session-scoped services.
     */
    startNewSession(sessionId, sessionData) {
        if (this.chatRecordingService?.hasWriteOwnership()) {
            throw new SessionWriterUnavailableError();
        }
        if (Object.hasOwn(this, 'goalRuntime')) {
            this.goalTurnHostUnbind?.();
            this.goalTurnHostUnbind = undefined;
            this.goalRuntime?.dispose();
        }
        // Finalize the outgoing session before switching.
        const outgoingChatRecordingService = this.chatRecordingService;
        try {
            outgoingChatRecordingService?.finalize();
        }
        catch {
            // Best-effort — don't block session switch
        }
        void outgoingChatRecordingService?.flush().catch(() => {
            // Best-effort — don't block session switch
        });
        const previousSessionId = this.sessionId;
        const nextSessionId = sessionId ?? randomUUID();
        // Resuming the session the user is already in keeps the same id. That is
        // not a lifecycle transition: ending it here would record session.end for
        // a live session and pair it with a duplicate session.start.
        const isSessionTransition = nextSessionId !== previousSessionId;
        if (isSessionTransition) {
            logSessionEnd(this);
        }
        this.sessionId = nextSessionId;
        // Unconditional: startNewSession is only called on the canonical Config
        // instance (the one that already claimed via sessionEnvClaimed), so this
        // correctly updates the env var to reflect the new active session.
        if (process.env) {
            process.env['QWEN_CODE_SESSION_ID'] = this.sessionId;
        }
        // Re-key the per-session model registry onto the new session id. Without
        // this the entry stays keyed on the outgoing id, so after /clear (or
        // /reset, /new, /resume) a non-owner Config's subprocesses resolve the
        // model by the new id, miss, and fall back to another session's value.
        // Drop the orphaned entry too — shutdown only unregisters the current id.
        unregisterSessionModel(previousSessionId);
        this.publishModelEnv();
        this.sessionData = sessionData;
        this.clearSessionRestoreProjection();
        this.pendingRecoveredAgentsNotice = null;
        this.getOwnActiveTodoReminders().clear();
        this.getOwnActiveTodoWorkChainOwners().clear();
        this.getOwnActiveTodoReminderTurns().clear();
        setDebugLogSession(this);
        this.debugLogger = createDebugLogger();
        // Pin the outgoing recorder to the session it wrote so late writes (a
        // turn settling after this rotation) keep targeting that session's
        // transcript instead of resolving the new session id from this Config.
        outgoingChatRecordingService?.pinSessionIdentity(previousSessionId);
        this.chatRecordingService = this.chatRecordingEnabled
            ? this.createChatRecordingService()
            : undefined;
        this.initializeGoalRuntime(this.sessionData?.conversation.messages);
        // The file-read cache is session-scoped: its `file_unchanged`
        // placeholder relies on the model having seen the prior full read
        // earlier in the *current* conversation. Carrying entries across
        // /clear or session resume would let a follow-up Read return the
        // placeholder despite the new session never having received the
        // file contents. Use the getter so the lazy own-property
        // initialization in getFileReadCache() applies even for Configs
        // constructed via Object.create — those should clear their own
        // cache, not the parent's.
        this.getFileReadCache().clear();
        this.toolResultBudget.bytesWritten = 0;
        this.getMemoryPressureMonitor()?.resetForNewSession();
        this.fileHistoryService = undefined;
        refreshSessionContext(this.sessionId);
        // The commit-attribution singleton accumulates per-file AI edits
        // and a session-scoped prompt counter — both stop being meaningful
        // when the session resets. Without this, pending attributions
        // from the previous session could attach to a commit in the new
        // one, and the "N-shotted" PR label would span sessions.
        CommitAttributionService.resetInstance();
        if (this.initialized) {
            logStartSession(this, new StartSessionEvent(this), sessionData && isSessionTransition ? previousSessionId : undefined);
        }
        // Refresh the runtime.json sidecar so external observers (terminal
        // multiplexers, IDE integrations, status daemons) see the new
        // session id rather than a stale claim against a still-live PID.
        // /clear, /reset, /new, and /resume all flow through this method,
        // so handling the swap centrally covers every same-PID session
        // transition. Best-effort: must never block /clear or /resume.
        //
        // Only refresh when THIS process established its own sidecar at
        // startup (interactive UI). A non-interactive `/clear` (e.g.
        // qwen --prompt-interactive) must not delete a sibling shell's
        // sidecar that happens to share the outgoing session id
        // mirrors the kimi-cli "write only when a session is
        // established for this process" rule.
        if (isSessionTransition) {
            if (this.runtimeStatusEnabled) {
                const oldPath = this.storage.getRuntimeStatusPath(previousSessionId);
                const newPath = this.storage.getRuntimeStatusPath(this.sessionId);
                const cliVersion = this.cliVersion ?? null;
                const workDir = this.targetDir;
                const newSessionId = this.sessionId;
                this.queueRuntimeStatusWrite(async () => {
                    await clearRuntimeStatus(oldPath);
                    await writeRuntimeStatus(newPath, {
                        sessionId: newSessionId,
                        workDir,
                        qwenVersion: cliVersion,
                    });
                });
            }
            if (this.sessionRegistryActive) {
                const workDir = this.targetDir;
                const newSessionId = this.sessionId;
                // Keep the session registry in step: this PID's record would
                // otherwise point discovery at the previous transcript. Keyed by
                // PID, so a swap is a patch rather than a delete-and-rewrite.
                //
                // Gated on the registry lifecycle rather than the sidecar's
                // `runtimeStatusEnabled`: the failure domains are independent.
                // When registration is still pending, this patch queues behind it;
                // when registration fails, `patchSessionRecord` no-ops on the
                // missing record. Either way a sidecar failure cannot leave `ps`
                // advertising the pre-/clear session id until exit.
                //
                // `name` is deliberately not patched: it is the handle a user
                // just read out of `qwen sessions ps`, and re-deriving it here
                // would rename a live session on every /clear for no gain — the
                // directory it names has not changed.
                this.queueSessionRegistryWrite(async () => {
                    await patchSessionRecord({ sessionId: newSessionId, cwd: workDir });
                });
            }
        }
        return this.sessionId;
    }
    /**
     * Marks this Config as the owner of a runtime.json sidecar for the
     * current PID. Call once after the initial sidecar write succeeds
     * (typically from the interactive UI bootstrap). When set, subsequent
     * startNewSession() calls will refresh the sidecar on session swap;
     * when unset, startNewSession() leaves sibling sidecars alone so a
     * short-lived non-interactive process can't trample a concurrent
     * shell's sidecar that happens to share the outgoing session id.
     */
    markRuntimeStatusEnabled() {
        this.runtimeStatusEnabled = true;
    }
    /**
     * Serializes initial registration with mid-session patches and cleanup.
     * The registration promise is deliberately not awaited by UI startup.
     */
    trackSessionRegistration(registration) {
        this.sessionRegistryActive = true;
        this.sessionRegistryWrite = this.sessionRegistryWrite
            .catch(() => {
            // Keep registration independent from an earlier best-effort write.
        })
            .then(async () => {
            this.sessionRegistered = await registration;
            if (!this.sessionRegistered)
                this.sessionRegistryActive = false;
        })
            .catch(() => {
            this.sessionRegistered = false;
            this.sessionRegistryActive = false;
        });
    }
    /** Drain queued patches, then remove this process's registered record. */
    async unregisterSessionRegistry() {
        this.sessionRegistryActive = false;
        this.sessionRegistryWrite = this.sessionRegistryWrite
            .catch(() => {
            // Keep cleanup alive after a best-effort patch failure.
        })
            .then(async () => {
            if (!this.sessionRegistered)
                return;
            this.sessionRegistered = false;
            await unregisterSession();
        })
            .catch(() => {
            // ignored: registry cleanup must not disrupt process teardown.
        });
        await this.sessionRegistryWrite;
    }
    queueRuntimeStatusWrite(write) {
        this.runtimeStatusWrite = this.runtimeStatusWrite
            .catch(() => {
            // Keep later writes alive after a best-effort sidecar failure.
        })
            .then(write)
            .catch(() => {
            // ignored: runtime status must not disrupt session control flow.
        });
    }
    /**
     * Queue a session-registry patch on its own serial chain.
     *
     * The chain is separate from `runtimeStatusWrite` and is deliberately
     * never awaited by session-transition paths:
     *
     * - A sidecar write that rejects or hangs must not skip or block the
     *   patch — the two target independent failure domains (project-local
     *   `chats/` dir vs the global Qwen dir).
     * - The patch writes the HOME filesystem, while `/cd` flushes the
     *   sidecar chain: awaiting the patch there would hang `/cd` whenever
     *   HOME stalls while the project directory is healthy. Registry
     *   patches are best-effort by contract — `ps` settles a tick after
     *   the transition returns. Process cleanup drains the chain before
     *   unregistering so a late patch cannot recreate the deleted record.
     *
     * Patches still serialize among themselves so back-to-back /clear and
     * /cd transitions cannot interleave their read-modify-write.
     */
    queueSessionRegistryWrite(write) {
        this.sessionRegistryWrite = this.sessionRegistryWrite
            .catch(() => {
            // Keep later patches alive after a best-effort patch failure.
        })
            .then(write)
            .catch(() => {
            // ignored: registry patches must not disrupt session control flow.
        });
    }
    async flushRuntimeStatusWrites() {
        await this.runtimeStatusWrite.catch(() => {
            // ignored: runtime status is best-effort.
        });
    }
    async refreshCurrentRuntimeStatus(workDir) {
        const sessionId = this.sessionId;
        // The sidecar write and the registry patch ride separate chains
        // (see queueSessionRegistryWrite): a sidecar failure on the
        // project filesystem must neither skip the patch nor hang `/cd` on
        // the HOME write. The failure domains are independent.
        if (this.runtimeStatusEnabled) {
            const sidecarPath = this.storage.getRuntimeStatusPath(sessionId);
            this.queueRuntimeStatusWrite(async () => {
                await writeRuntimeStatus(sidecarPath, {
                    sessionId,
                    workDir,
                    qwenVersion: this.cliVersion ?? null,
                });
            });
        }
        if (this.sessionRegistryActive) {
            this.queueSessionRegistryWrite(async () => {
                // The registry's DIRECTORY column is how a user tells two live
                // sessions apart, so a mid-session directory switch has to reach
                // it too — otherwise `qwen sessions ps` keeps advertising the
                // folder this session left. Unlike the /clear path, `name`
                // follows: it is derived from the directory's basename, which is
                // exactly what changed here.
                await patchSessionRecord({
                    cwd: workDir,
                    name: deriveSessionName(workDir, sessionId),
                });
            });
        }
        await this.flushRuntimeStatusWrites();
    }
    /**
     * Returns the resumed session data if this session was resumed from a previous one.
     */
    getResumedSessionData() {
        return this.sessionData;
    }
    shouldLoadMemoryFromIncludeDirectories() {
        return this.loadMemoryFromIncludeDirectories;
    }
    getImportFormat() {
        return this.importFormat;
    }
    getContentGeneratorConfig() {
        return (getRuntimeContentGenerator()?.contentGeneratorConfig ??
            this.contentGeneratorConfig);
    }
    getContentGeneratorConfigSources() {
        // If contentGeneratorConfigSources is empty (before initializeAuth),
        // get sources from ModelsConfig
        if (Object.keys(this.contentGeneratorConfigSources).length === 0 &&
            this.modelsConfig) {
            return this.modelsConfig.getGenerationConfigSources();
        }
        return this.contentGeneratorConfigSources;
    }
    getModel() {
        return (this.getContentGeneratorConfig()?.model || this.modelsConfig.getModel());
    }
    getCurrentModelRegistryBaseUrl() {
        return this.modelsConfig.getCurrentRegistryBaseUrl();
    }
    /**
     * Resolve the effective input modalities of the current primary model. The
     * content generator config always carries resolved modalities (name-based
     * detection fills them in, defaulting unknown models to text-only), which is
     * the same source the file reader uses to decide media support. Used to
     * decide whether the vision bridge should run.
     *
     * @returns The resolved input modalities. Unknown models are treated as
     * text-only so bridge features can conservatively adapt image inputs.
     */
    getEffectiveInputModalities() {
        return this.getContentGeneratorConfig()?.modalities ?? {};
    }
    /**
     * Get the human-readable display name for the currently selected model.
     * Resolves the model id to its name from the model registry.
     * Falls back to the raw model id when the model is not found.
     */
    getModelDisplayName() {
        return this.modelsConfig.getModelDisplayName(this.getModel());
    }
    onModelChange(listener) {
        this.modelChangeListeners.add(listener);
        return () => {
            this.modelChangeListeners.delete(listener);
        };
    }
    notifyModelChangeListeners() {
        this.publishModelEnv();
        const model = this.getModel();
        for (const listener of this.modelChangeListeners) {
            listener(model);
        }
    }
    // Keeps QWEN_CODE_MODEL on the model that is actually active. A subprocess
    // has no other authoritative source: settings files miss /model switches and
    // describe the wrong home under QWEN_HOME isolation. Published per session —
    // every Config writes its OWN session's model, keyed on sessionId exactly
    // like the project dir, so in daemon mode each session's subprocesses read
    // theirs, not the first session's (a process-global slot alone would hold
    // whichever session booted first). The process-global slot is the
    // single-session CLI fallback, gated on the claiming instance so a throwaway
    // Config never clobbers the live session's value there.
    publishModelEnv() {
        if (!process.env) {
            return;
        }
        const model = this.getModel();
        // Both registered per session: the identity is what /review's same-model
        // gate compares, and in daemon mode one process-global slot holds
        // whichever session booted first — handing a later session that value
        // would qualify its model with ANOTHER session's provider, which passes
        // gates the bare id would have failed.
        registerSessionModel(this.sessionId, model, this.resolvedModelIdentity());
        if (this.ownsModelEnvSlot) {
            process.env['QWEN_CODE_MODEL'] = model;
            process.env['QWEN_CODE_MODEL_IDENTITY'] = this.resolvedModelIdentity();
        }
    }
    /**
     * The active model qualified by WHERE it resolves — what a bare id cannot
     * say.
     *
     * A model id is unique only inside one provider configuration: two auth
     * types, or two registry endpoints, can expose the same name over different
     * underlying models. Anything that treats "same id" as "same model" is
     * wrong across such a pair, and /review's incremental anchor is exactly
     * that kind of consumer — it skips code on the strength of "the same model
     * already reviewed this". The discriminators are hashed rather than spelled
     * out because the value is persisted and displayed: a base URL can carry a
     * tenant or a token-bearing host, and eight hex characters separate the
     * configurations without publishing where they point. The bare id stays the
     * readable half, so a mismatch still names the model a human recognises.
     */
    resolvedModelIdentity() {
        const model = this.getModel();
        const authType = this.getContentGeneratorConfig()?.authType ?? '';
        const baseUrl = this.getContentGeneratorConfig()?.baseUrl ??
            this.getCurrentModelRegistryBaseUrl() ??
            '';
        if (authType === '' && baseUrl === '')
            return model;
        const digest = createHash('sha256')
            .update(`${authType}\u0000${baseUrl}`)
            .digest('hex')
            .slice(0, 8);
        return `${model}@${digest}`;
    }
    /**
     * Returns the configured fast model selector when it resolves to an available
     * model. Bare selectors stay bare and authType-qualified selectors keep their
     * authType prefix so selector-aware runtime paths can route cross-auth calls.
     */
    getFastModel() {
        const selector = this.resolveFastModelSelector();
        if (!selector)
            return undefined;
        const available = selector.authType
            ? this.getAllConfiguredModels([selector.authType])
            : this.getAllConfiguredModels();
        if (!available.some((model) => model.id === selector.modelId &&
            !model.voiceOnly &&
            !model.imageOnly &&
            !model.visionOnly)) {
            return undefined;
        }
        const rawSelector = resolveModelId(this.fastModel);
        return rawSelector?.authType
            ? `${rawSelector.authType}:${selector.modelId}`
            : selector.modelId;
    }
    /**
     * Settings for the built-in WebSearch tool. Undefined when the feature was
     * never configured.
     */
    getWebSearchSettings() {
        return this.webSearchSettings;
    }
    resolveFastModelSelector() {
        if (!this.fastModel)
            return undefined;
        try {
            const rawSelector = resolveModelId(this.fastModel);
            if (!rawSelector)
                return undefined;
            if (rawSelector.authType)
                return rawSelector;
            const currentAuthType = this.getContentGeneratorConfig()?.authType;
            if (!currentAuthType) {
                this.debugLogger.debug('No active auth type; skipping bare fast model resolution');
                return undefined;
            }
            return resolveModelId(this.fastModel, {
                currentAuthType,
                getAvailableModels: () => this.getAllConfiguredModels([currentAuthType]),
            });
        }
        catch {
            return undefined;
        }
    }
    /**
     * Update the fast model at runtime (e.g., when the user runs `/model --fast <model>`).
     * Pass undefined or an empty string to clear the fast model override.
     */
    setFastModel(model) {
        this.fastModel = model || undefined;
    }
    /**
     * Update the vision bridge model at runtime (e.g. `/model --vision <model>`).
     * Pass undefined or an empty string to clear the override and fall back to
     * same-provider auto-select.
     */
    setVisionModel(model) {
        this.visionModel = model || undefined;
    }
    /**
     * Resolve the compaction model for chat compression (auto-compaction).
     * Priority: compactionModel (if set) → main model.
     */
    getCompactionModel() {
        const selector = this.resolveCompactionModelSelector();
        if (selector) {
            const available = selector.authType
                ? this.getAllConfiguredModels([selector.authType])
                : this.getAllConfiguredModels();
            if (!available.some((m) => m.id === selector.modelId &&
                !m.fastOnly &&
                !m.voiceOnly &&
                !m.imageOnly &&
                !m.visionOnly)) {
                return undefined;
            }
            const rawSelector = resolveModelId(this.compactionModel);
            return rawSelector?.authType
                ? `${rawSelector.authType}:${selector.modelId}`
                : selector.modelId;
        }
        return this.getModel();
    }
    resolveCompactionModelSelector() {
        if (!this.compactionModel)
            return undefined;
        try {
            const rawSelector = resolveModelId(this.compactionModel);
            if (!rawSelector)
                return undefined;
            if (rawSelector.authType)
                return rawSelector;
            const currentAuthType = this.getContentGeneratorConfig()?.authType;
            if (!currentAuthType) {
                this.debugLogger.debug('No active auth type; skipping bare compaction model resolution');
                return undefined;
            }
            return resolveModelId(this.compactionModel, {
                currentAuthType,
                getAvailableModels: () => this.getAllConfiguredModels([currentAuthType]),
            });
        }
        catch {
            return undefined;
        }
    }
    /**
     * Update the compaction model at runtime (e.g. `/model --compaction <model>`).
     * Pass undefined or an empty string to clear the override and fall back to
     * the main model.
     */
    setCompactionModel(model) {
        this.compactionModel = model || undefined;
    }
    /**
     * Update the image generation model and make the tool available immediately
     * when the selected provider route is valid.
     */
    async setImageModel(model) {
        this.imageModel = model || undefined;
        if (!this.initialized || !this.isImageGenerationEnabled()) {
            return;
        }
        await this.registerImageGenerationTool(this.toolRegistry);
        await this.toolRegistry.ensureTool(ToolNames.IMAGE_GEN);
    }
    /**
     * Return the ordered list of fallback model IDs configured for this session.
     * The list is already normalized (deduplicated, capped at 3, blanks removed).
     * Returns an empty array when no fallbacks are configured.
     */
    getModelFallbacks() {
        return this.modelFallbacks;
    }
    /**
     * Read the active reasoning-effort tier from the live content-generator
     * config. Returns undefined when thinking is disabled (`reasoning: false`) or
     * no tier is set (the model/provider default applies).
     */
    getReasoningEffort() {
        const reasoning = this.getContentGeneratorConfig()?.reasoning;
        // `!reasoning` already covers both `false` and `undefined` (both falsy).
        if (!reasoning) {
            return undefined;
        }
        return reasoning.effort;
    }
    /**
     * Return a higher-priority static DashScope knob that shadows the current
     * global effort on qwen3.8-max, so interactive callers can report the
     * effective outcome instead of confirming a tier that will not reach the
     * wire. The provider resolves extra_body before samplingParams before the
     * unified reasoning setting; same-layer explicit effort still wins budget.
     */
    getReasoningEffortOverride() {
        const cfg = this.getContentGeneratorConfig();
        if (!cfg ||
            !DashScopeOpenAICompatibleProvider.isDashScopeProvider(cfg) ||
            !isTieredEffortWireModel(cfg.model)) {
            return undefined;
        }
        const currentEffort = this.getReasoningEffort();
        const selected = selectDashScopeThinkingKnob(cfg.model, cfg.extra_body, cfg.samplingParams, currentEffort);
        if (!selected ||
            selected.source === 'reasoning' ||
            (selected.field === 'reasoning_effort' &&
                selected.value === currentEffort)) {
            return undefined;
        }
        if (selected.field === 'enable_thinking' && selected.value === true) {
            // An on-switch never blocks the tier — the wire drops the switch and
            // ships it — so only a request-level effort override can still shadow
            // the current tier from under it.
            if (selected.source !== 'extra_body') {
                return undefined;
            }
            const below = selectDashScopeThinkingKnob(cfg.model, undefined, cfg.samplingParams, currentEffort);
            if (below?.source === 'samplingParams' &&
                below.field === 'reasoning_effort' &&
                below.value !== currentEffort) {
                return { source: below.source, field: below.field };
            }
            return undefined;
        }
        return { source: selected.source, field: selected.field };
    }
    /**
     * Update the reasoning-effort tier at runtime (e.g. `/effort high`). The
     * request pipeline reads `reasoning.effort` per request, so mutating the live
     * config in place takes effect on the next turn without an auth refresh.
     * Provider adapters clamp the tier to what the active model supports. Pass
     * undefined to clear the override and fall back to the model/provider default.
     *
     * No-op when thinking is explicitly disabled (`reasoning: false`) so effort
     * cannot silently re-enable it.
     */
    setReasoningEffort(effort) {
        const applyEffort = (cfg) => {
            if (!cfg || cfg.reasoning === false) {
                return;
            }
            const next = {
                ...(cfg.reasoning ?? {}),
            };
            if (effort) {
                next.effort = effort;
            }
            else {
                delete next.effort;
            }
            // Clearing the last key (e.g. setReasoningEffort(undefined) with no
            // sibling budget_tokens) collapses `reasoning` back to undefined rather
            // than leaving an empty `{}` — an empty object is truthy, so downstream
            // `if (cfg.reasoning)` checks would treat reasoning as active and the
            // pipeline would emit `reasoning: {}` as wire noise.
            cfg.reasoning = Object.keys(next).length > 0 ? next : undefined;
        };
        // The main session and a runtime (sub-agent) content generator may hold
        // distinct config objects; update whichever the request path reads.
        applyEffort(this.contentGeneratorConfig);
        const runtimeCfg = getRuntimeContentGenerator()?.contentGeneratorConfig;
        if (runtimeCfg && runtimeCfg !== this.contentGeneratorConfig) {
            applyEffort(runtimeCfg);
        }
        // Keep the rebuildable source in sync so a later refreshAuth keeps the tier.
        applyEffort(this.modelsConfig?.getGenerationConfig());
    }
    /**
     * Whether `model` is the same entry as the current primary model — matched on
     * the provider identity (auth type, and baseUrl when both carry one), not just
     * the bare id. The vision bridge must never route at the primary (it's the
     * text-only model the bridge works around), but a cross-provider namesake —
     * the same bare id on another provider/endpoint, e.g. `anthropic:shared-model`
     * vs an `openai` `shared-model` primary — is a different model and stays
     * eligible. When the primary's auth type is unknown we can't disambiguate, so
     * fall back to a conservative bare-id match (never risk hitting the primary).
     */
    isCurrentPrimaryModel(model) {
        if (model.id !== this.getModel())
            return false;
        const cfg = this.getContentGeneratorConfig();
        const primaryAuthType = cfg?.authType;
        if (primaryAuthType === undefined)
            return true;
        if (model.authType !== primaryAuthType)
            return false;
        const primaryBaseUrl = cfg?.baseUrl;
        if (primaryBaseUrl !== undefined && model.baseUrl !== undefined) {
            return model.baseUrl === primaryBaseUrl;
        }
        return true;
    }
    /**
     * Resolve the user's explicit `visionModel` (set via `/model --vision`) into a
     * bridge selection. The selected id is auth-qualified so `runSideQuery`
     * resolves the exact provider route; the endpoint is looked up for the egress
     * notice. Returns `undefined` (so the caller falls back to
     * same-provider auto-select) when no explicit model is set, the selector can't
     * be parsed, the pinned model isn't actually configured, or it points at the
     * text-only primary itself — those guards keep a stale/typo'd pin from firing
     * the bridge at an unreachable, or non-image-capable, model.
     */
    resolveVisionModelSelection() {
        if (!this.visionModel)
            return undefined;
        const visionModelForLog = formatVisionModelSettingForLog(this.visionModel);
        const parsedSetting = parseVisionModelSetting(this.visionModel);
        if (!parsedSetting) {
            this.debugLogger.warn(`vision model pin '${visionModelForLog}' could not be parsed; falling back to auto-select`);
            return undefined;
        }
        let selector;
        try {
            selector = resolveModelId(parsedSetting.selector);
        }
        catch {
            this.debugLogger.warn(`vision model pin '${visionModelForLog}' could not be parsed; falling back to auto-select`);
            return undefined;
        }
        if (!selector) {
            this.debugLogger.warn(`vision model pin '${visionModelForLog}' resolved to no selector; falling back to auto-select`);
            return undefined;
        }
        // Each guard below silently drops the pin (the hardest failure mode to
        // debug, hence the warn): skip selector-only models (a `settings.json`
        // pin can bypass the slash command's filter), and never route the bridge at
        // the primary entry itself (the text-only model the bridge works around) —
        // via the provider-aware identity check so a cross-provider namesake stays
        // eligible.
        const routeMatches = this.getAllConfiguredModels().filter((m) => m.id === selector.modelId &&
            (!selector.authType || m.authType === selector.authType) &&
            (!parsedSetting.baseUrl || m.baseUrl === parsedSetting.baseUrl) &&
            !m.fastOnly &&
            !m.voiceOnly &&
            !m.imageOnly &&
            !this.isCurrentPrimaryModel(m));
        if (routeMatches.length > 1) {
            this.debugLogger.warn(`vision model pin '${visionModelForLog}' matched multiple configured routes; falling back to auto-select`);
            return undefined;
        }
        const match = routeMatches[0];
        if (!match) {
            this.debugLogger.warn(`vision model pin '${visionModelForLog}' did not match a usable configured model ` +
                `(removed, mistyped, selector-only, or the primary itself); falling back to auto-select`);
            return undefined;
        }
        const agentCapable = isFullTurnVisionCapable(match);
        return {
            id: getQualifiedVisionModelId(match),
            ...((parsedSetting.baseUrl ?? match.baseUrl) && {
                baseUrl: parsedSetting.baseUrl ?? match.baseUrl,
            }),
            ...(agentCapable && { agentCapable: true }),
        };
    }
    /**
     * The vision bridge model: the explicit `visionModel` (`/model --vision`) when
     * set, otherwise an auto-picked image-capable model on the SAME provider as
     * the text-only primary (see {@link selectVisionBridgeModel} — auto-select
     * never reaches across providers; an explicit override may). `runSideQuery`
     * resolves the chosen model's credentials by id.
     *
     * @returns The bridge model selection, or `undefined`.
     */
    getDefaultVisionBridgeModel() {
        const explicit = this.resolveVisionModelSelection();
        if (explicit)
            return explicit;
        const contentGeneratorConfig = this.getContentGeneratorConfig();
        return selectVisionBridgeModel(this.getModel(), this.getAllConfiguredModels(), {
            authType: contentGeneratorConfig?.authType,
            baseUrl: contentGeneratorConfig?.baseUrl,
        });
    }
    /**
     * Per-attempt timeout in milliseconds for the vision bridge transcription
     * call. Resolves the `visionBridgeTimeoutMs` setting; `undefined` means the
     * bridge's built-in default applies.
     */
    getVisionBridgeTimeoutMs() {
        return this.visionBridgeTimeoutMs;
    }
    /**
     * Set model programmatically (e.g., VLM auto-switch, fallback).
     * Delegates to ModelsConfig.
     */
    async setModel(newModel, metadata) {
        await this.modelsConfig.setModel(newModel, metadata);
        // Also update contentGeneratorConfig for hot-update compatibility
        if (this.contentGeneratorConfig) {
            this.contentGeneratorConfig.model = newModel;
        }
        this.notifyModelChangeListeners();
    }
    /**
     * Handle model change from ModelsConfig.
     * This updates the content generator config with the new model settings.
     */
    async handleModelChange(authType, requiresRefresh) {
        if (!this.contentGeneratorConfig) {
            return;
        }
        // Reasoning effort is a global, model-independent preference (set via
        // /effort). Capture it before the rebuild and re-apply after, so switching
        // models never silently drops the user's chosen effort — neither the
        // hot-update path (which copies a fixed field set, not `reasoning`) nor the
        // full refresh path (which rebuilds the config from scratch).
        const priorReasoningEffort = this.getReasoningEffort();
        // Keep full history (including thought parts) on model switch.
        // Some OpenAI-compatible reasoning models (e.g. DeepSeek) require
        // reasoning_content to be preserved across turns.
        // Hot update path: only supported for qwen-oauth.
        // For other auth types we always refresh to recreate the ContentGenerator.
        //
        // Rationale:
        // - Non-qwen providers may need to re-validate credentials / baseUrl / envKey.
        // - ModelsConfig.applyResolvedModelDefaults can clear or change credentials sources.
        // - Refresh keeps runtime behavior consistent and centralized.
        if (authType === AuthType.lailatulcoder_OAUTH && !requiresRefresh) {
            const { config, sources } = resolveContentGeneratorConfigWithSources(this, authType, this.modelsConfig.getGenerationConfig(), this.modelsConfig.getGenerationConfigSources(), {
                strictModelProvider: this.modelsConfig.isStrictModelProviderSelection(),
            });
            // Hot-update fields (qwen-oauth models share the same auth + client).
            // Deliberately does NOT copy `reasoning`: it is a global, model-independent
            // preference captured in `priorReasoningEffort` above and re-applied via
            // setReasoningEffort() below. Do not add `reasoning` here — that would
            // overwrite the live tier with the new model's default and make the
            // restore a no-op.
            this.contentGeneratorConfig.model = config.model;
            this.contentGeneratorConfig.samplingParams = config.samplingParams;
            this.contentGeneratorConfig.contextWindowSize = config.contextWindowSize;
            this.contentGeneratorConfig.enableCacheControl =
                config.enableCacheControl;
            this.contentGeneratorConfig.forceGlobalCacheScope =
                config.forceGlobalCacheScope;
            this.contentGeneratorConfig.cacheRetention = config.cacheRetention;
            this.contentGeneratorConfig.cacheRetentionByBlock =
                config.cacheRetentionByBlock;
            this.contentGeneratorConfig.splitToolMedia = config.splitToolMedia;
            this.contentGeneratorConfig.toolResultContentFormat =
                config.toolResultContentFormat;
            // Modalities are model-derived: a hot switch between oauth models with
            // different image support must update them, or the vision-bridge gate and
            // image-stripping read the previous model's modalities.
            this.contentGeneratorConfig.modalities = config.modalities;
            if ('model' in sources) {
                this.contentGeneratorConfigSources['model'] = sources['model'];
            }
            if ('modalities' in sources) {
                this.contentGeneratorConfigSources['modalities'] =
                    sources['modalities'];
            }
            if ('samplingParams' in sources) {
                this.contentGeneratorConfigSources['samplingParams'] =
                    sources['samplingParams'];
            }
            if ('enableCacheControl' in sources) {
                this.contentGeneratorConfigSources['enableCacheControl'] =
                    sources['enableCacheControl'];
            }
            if ('forceGlobalCacheScope' in sources) {
                this.contentGeneratorConfigSources['forceGlobalCacheScope'] =
                    sources['forceGlobalCacheScope'];
            }
            if ('cacheRetention' in sources) {
                this.contentGeneratorConfigSources['cacheRetention'] =
                    sources['cacheRetention'];
            }
            if ('cacheRetentionByBlock' in sources) {
                this.contentGeneratorConfigSources['cacheRetentionByBlock'] =
                    sources['cacheRetentionByBlock'];
            }
            if ('contextWindowSize' in sources) {
                this.contentGeneratorConfigSources['contextWindowSize'] =
                    sources['contextWindowSize'];
            }
            if ('splitToolMedia' in sources) {
                this.contentGeneratorConfigSources['splitToolMedia'] =
                    sources['splitToolMedia'];
            }
            if ('toolResultContentFormat' in sources) {
                this.contentGeneratorConfigSources['toolResultContentFormat'] =
                    sources['toolResultContentFormat'];
            }
            if (priorReasoningEffort) {
                this.setReasoningEffort(priorReasoningEffort);
            }
            resetPreloadedContentGenerator(this.contentGenerator);
            return;
        }
        // Full refresh path. `refreshAuth` re-applies the reasoning effort it
        // captures, but on a model *switch* that capture is already stale: the
        // preceding switchModel() ran applyResolvedModelDefaults(), which overwrote
        // modelsConfig's `reasoning` with the new model's preset (undefined for most
        // models), BEFORE this callback fires. So refreshAuth reads `undefined` and
        // cannot restore the tier. Re-apply here from `priorReasoningEffort`, which
        // we captured off the still-intact live contentGeneratorConfig above. This is
        // a no-op when the new model disables thinking (`reasoning: false`), since
        // setReasoningEffort() skips that case and never silently re-enables it.
        await this.refreshAuth(authType);
        if (priorReasoningEffort) {
            this.setReasoningEffort(priorReasoningEffort);
        }
    }
    /**
     * Get available models for the current authType.
     * Delegates to ModelsConfig.
     */
    getAvailableModels() {
        return this.modelsConfig.getAvailableModels();
    }
    /**
     * Get available models for a specific authType.
     * Delegates to ModelsConfig.
     */
    getAvailableModelsForAuthType(authType) {
        return this.modelsConfig.getAvailableModelsForAuthType(authType);
    }
    /**
     * Get all configured models across authTypes.
     * Delegates to ModelsConfig.
     */
    getAllConfiguredModels(authTypes) {
        return this.modelsConfig.getAllConfiguredModels(authTypes);
    }
    /**
     * Get the fully resolved provider model config (generationConfig defaults
     * applied) for a specific modelProviders entry.
     * Delegates to ModelsConfig.
     */
    getResolvedModelConfig(authType, modelId, baseUrl) {
        return this.modelsConfig.getResolvedModel(authType, modelId, baseUrl);
    }
    /**
     * Get the currently active runtime model snapshot.
     * Delegates to ModelsConfig.
     */
    getActiveRuntimeModelSnapshot() {
        return this.modelsConfig.getActiveRuntimeModelSnapshot();
    }
    /**
     * Switch authType+model.
     * Supports both registry-backed models and runtime model snapshots.
     *
     * For runtime models, the modelId should be in format `$runtime|${authType}|${modelId}`.
     * This triggers a refresh of the ContentGenerator when required (always on authType changes).
     * For qwen-oauth model switches that are hot-update safe, this may update in place.
     *
     * @param authType - Target authentication type
     * @param modelId - Target model ID (or `$runtime|${authType}|${modelId}` for runtime models)
     * @param options - Additional options like requireCachedCredentials
     */
    async switchModel(authType, modelId, options) {
        await this.modelsConfig.switchModel(authType, modelId, options);
        this.notifyModelChangeListeners();
    }
    getMaxSessionTurns() {
        return this.maxSessionTurns;
    }
    getMaxSubagentDepth() {
        return this.maxSubagentDepth;
    }
    getMaxWallTimeSeconds() {
        return this.maxWallTimeSeconds;
    }
    getMaxToolCalls() {
        return this.maxToolCalls;
    }
    getClearContextOnIdle() {
        return this.clearContextOnIdle;
    }
    getSessionTokenLimit() {
        return this.sessionTokenLimit;
    }
    getEmbeddingModel() {
        return this.embeddingModel;
    }
    getSandbox() {
        return this.sandbox;
    }
    isRestrictiveSandbox() {
        const sandboxConfig = this.getSandbox();
        const seatbeltProfile = process.env['SEATBELT_PROFILE'];
        return (!!sandboxConfig &&
            sandboxConfig.command === 'sandbox-exec' &&
            !!seatbeltProfile &&
            seatbeltProfile.startsWith('restrictive-'));
    }
    getTargetDir() {
        return this.targetDir;
    }
    getCurrentSessionArtifactMoves(oldStorage, newStorage) {
        const oldChatsDir = path.join(oldStorage.getProjectDir(), 'chats');
        const newChatsDir = path.join(newStorage.getProjectDir(), 'chats');
        return [
            `${this.sessionId}.jsonl`,
            `${this.sessionId}.runtime.json`,
            `${this.sessionId}.worktree.json`,
        ].map((fileName) => ({
            from: path.join(oldChatsDir, fileName),
            to: path.join(newChatsDir, fileName),
        }));
    }
    moveFile(from, to) {
        try {
            fs.renameSync(from, to);
        }
        catch (error) {
            if (error.code !== 'EXDEV') {
                throw error;
            }
            let copied = false;
            try {
                fs.copyFileSync(from, to);
                copied = true;
                fs.unlinkSync(from);
            }
            catch (fallbackError) {
                if (copied) {
                    try {
                        fs.unlinkSync(to);
                    }
                    catch {
                        // Best-effort cleanup; surface the original fallback failure.
                    }
                }
                throw fallbackError;
            }
        }
    }
    moveCurrentSessionArtifacts(oldStorage, newStorage) {
        const moved = [];
        for (const { from, to } of this.getCurrentSessionArtifactMoves(oldStorage, newStorage)) {
            if (!fs.existsSync(from)) {
                continue;
            }
            fs.mkdirSync(path.dirname(to), { recursive: true });
            try {
                this.moveFile(from, to);
                moved.push({ from, to });
            }
            catch (error) {
                for (const movedArtifact of moved.reverse()) {
                    try {
                        fs.mkdirSync(path.dirname(movedArtifact.from), {
                            recursive: true,
                        });
                        this.moveFile(movedArtifact.to, movedArtifact.from);
                    }
                    catch (rollbackError) {
                        this.debugLogger.warn('Failed to roll back moved session artifact', rollbackError);
                    }
                }
                throw error;
            }
        }
    }
    async prepareSessionArtifactMigration(oldStorage, newStorage, oldDir, opts) {
        try {
            this.chatRecordingService?.finalize();
            await this.chatRecordingService?.flush();
        }
        catch (error) {
            this.debugLogger.debug('Continuing session artifact migration after chat recording settle failed:', error);
        }
        await this.flushRuntimeStatusWrites();
        try {
            this.moveCurrentSessionArtifacts(oldStorage, newStorage);
        }
        catch (error) {
            if (!opts?.skipProcessChdir) {
                try {
                    process.chdir(oldDir);
                }
                catch (rollbackError) {
                    this.debugLogger.warn('Failed to roll back working directory after session artifact migration failed', rollbackError);
                }
            }
            throw error;
        }
    }
    async relocateWorkingDirectory(newDir, expectedCanonicalDir, opts) {
        if (!opts?.skipArtifactMigration &&
            this.chatRecordingService?.hasWriteOwnership()) {
            throw new SessionWriterUnavailableError();
        }
        const oldDir = opts?.skipProcessChdir
            ? this.cwd
            : fs.realpathSync(process.cwd());
        const targetPath = path.resolve(newDir);
        const expected = expectedCanonicalDir ?? fs.realpathSync(targetPath);
        if (!fs.statSync(targetPath).isDirectory()) {
            throw new Error(`Path is not a directory: ${targetPath}`);
        }
        const workspaceDirectories = WorkspaceContext.resolveRootDirectories(expected, this.explicitIncludeDirectories);
        if (!opts?.skipProcessChdir) {
            process.chdir(targetPath);
            const actualCwd = fs.realpathSync(process.cwd());
            if (actualCwd !== expected) {
                process.chdir(oldDir);
                throw new Error(`Changed directory to ${actualCwd}, expected ${expected}.`);
            }
        }
        else {
            // ACP path: validate realpath matches expected without calling
            // process.chdir — guards against TOCTOU swaps between the trust
            // check and the config state update.
            const actualCanonical = fs.realpathSync(targetPath);
            if (actualCanonical !== expected) {
                throw new Error(`Realpath mismatch: resolved ${actualCanonical}, expected ${expected}.`);
            }
        }
        const oldStorage = this.storage;
        if (!opts?.skipArtifactMigration) {
            const newStorage = new Storage(expected, this.sessionRuntimeBaseDir);
            await this.prepareSessionArtifactMigration(oldStorage, newStorage, oldDir, opts);
            this.storage = newStorage;
            this.chatRecordingService?.resetStoragePaths();
        }
        this.backgroundTaskRegistry.disposeResidentAgents();
        this.targetDir = expected;
        this.cwd = expected;
        resetPreloadedContentGenerator(this.contentGenerator);
        await this.refreshCurrentRuntimeStatus(expected);
        this.workspaceContext.applyRootDirectories(workspaceDirectories);
        this.fileDiscoveryService = null;
        this.sessionService = undefined;
        this.fileHistoryService = undefined;
        this.getFileReadCache().clear();
        let memoryRefreshError;
        try {
            await this.refreshHierarchicalMemory();
        }
        catch (error) {
            memoryRefreshError = error;
        }
        let mcpRefreshError;
        try {
            await this.waitForMcpReady();
            await this.refreshMcpServers();
        }
        catch (error) {
            mcpRefreshError = error;
        }
        return {
            ...(memoryRefreshError !== undefined && { memoryRefreshError }),
            ...(mcpRefreshError !== undefined && { mcpRefreshError }),
        };
    }
    /**
     * Stashes a one-shot context message that the next user prompt will
     * inject into the model (see {@link pendingStartupWorktreeNotice}). Called
     * from `gemini.tsx` right after `loadCliConfig` when `--worktree` produced
     * a valid worktree. Pass `null` to clear (rarely needed).
     */
    setPendingStartupWorktreeNotice(notice) {
        this.pendingStartupWorktreeNotice = notice;
    }
    /**
     * Reads and clears the pending startup-worktree notice. Returns `null`
     * when nothing is stashed (the common case). Each entry point (TUI /
     * headless / ACP) calls this on the model's first prompt; a non-null
     * return means the entry point should NOT additionally call
     * `restoreWorktreeContext()` for that prompt — startup overrides resume.
     */
    consumePendingStartupWorktreeNotice() {
        const v = this.pendingStartupWorktreeNotice;
        this.pendingStartupWorktreeNotice = null;
        return v;
    }
    getProjectRoot() {
        return this.targetDir;
    }
    getCwd() {
        return this.targetDir;
    }
    getWorkspaceContext() {
        return this.workspaceContext;
    }
    getToolRegistry() {
        return this.toolRegistry;
    }
    /**
     * Shuts down the Config and releases all resources.
     * This method is idempotent and safe to call multiple times.
     * It handles the case where initialization was not completed.
     */
    async shutdown(options) {
        this.shutdownRequested = true;
        this.settingsWatcher?.stopWatching();
        const closeWriter = () => this.closeSessionWriter().catch((error) => {
            this.debugLogger.error('Failed to release session writer lease:', error);
        });
        const earlyWriterClose = !options?.skipSessionWriter &&
            this.initializationPromise !== undefined &&
            !this.initializationSucceeded
            ? closeWriter()
            : undefined;
        try {
            if (!options?.skipSessionWriter && !earlyWriterClose) {
                try {
                    this.chatRecordingService?.finalize();
                    await this.chatRecordingService?.flush();
                }
                catch {
                    // Best-effort — don't block shutdown
                }
            }
            try {
                await this.shutdownResources(options?.strictResourceCleanup === true);
            }
            catch (error) {
                if (options?.strictResourceCleanup)
                    throw error;
            }
        }
        finally {
            if (!options?.skipSessionWriter) {
                await (earlyWriterClose ?? closeWriter());
            }
            this.chatRecordingFailureListeners.clear();
            if (options?.shutdownTelemetry !== false && isTelemetrySdkInitialized()) {
                await shutdownTelemetry();
            }
        }
    }
    async shutdownResources(waitForInitialization) {
        if (waitForInitialization) {
            try {
                await this.initializationPromise;
            }
            catch {
                // Partial initialization still needs resource cleanup.
            }
        }
        else if (this.initializationPromise && !this.initializationSettled) {
            this.scheduleResourceShutdownAfterInitialization();
            return;
        }
        return this.runResourceShutdown();
    }
    scheduleResourceShutdownAfterInitialization() {
        if (this.resourceShutdownAfterInitializationScheduled ||
            !this.initializationPromise) {
            return;
        }
        this.resourceShutdownAfterInitializationScheduled = true;
        void this.initializationPromise
            .then(() => this.runResourceShutdown(), () => this.runResourceShutdown())
            .catch((error) => {
            this.debugLogger.error('Deferred Config resource cleanup failed:', error);
        });
    }
    runResourceShutdown() {
        if (this.resourceShutdownPromise) {
            return this.resourceShutdownPromise;
        }
        const shutdown = this.shutdownResourcesOnce();
        this.resourceShutdownPromise = shutdown;
        const clear = () => {
            if (this.resourceShutdownPromise === shutdown) {
                this.resourceShutdownPromise = undefined;
            }
        };
        void shutdown.then(clear, clear);
        return shutdown;
    }
    async shutdownResourcesOnce() {
        try {
            this.clearSessionRestoreProjection();
            // Drop this session's project-dir registry entry. It is registered during
            // initialization, so it is released here whenever that step completed —
            // in daemon mode, where one process serves many sessions, an unreleased
            // entry per session is a leak that grows for the life of the process.
            if (this.sessionProjectDirRegistered) {
                unregisterSessionProjectDir(this.sessionId);
                this.sessionProjectDirRegistered = false;
            }
            // Drop this session's model registry entry. It is registered at
            // construction (publishModelEnv), so it is released on every shutdown —
            // same daemon-mode leak rationale as the project dir above.
            unregisterSessionModel(this.sessionId);
            if (Object.hasOwn(this, 'goalRuntime')) {
                this.rejectGoalRestoreActivation?.(new GoalPersistenceUnavailableError('Goal runtime disposed'));
                this.goalRestoreActivation = undefined;
                this.rejectGoalRestoreActivation = undefined;
                this.goalTurnHostUnbind?.();
                this.goalTurnHostUnbind = undefined;
                // Shutting down before the writer arrived: nothing will ever run
                // the deferred restore, so settle it rather than strand awaiters.
                this.settlePendingGoalRestore(new GoalPersistenceUnavailableError('Config shut down before the session writer became available'));
                this.goalRuntime?.dispose();
            }
            if (!this.initialized) {
                // Nothing else to clean up if not initialized.
                return;
            }
            this.skillManager?.stopWatching();
            if (this.toolRegistry) {
                await this.toolRegistry.stop();
            }
            this.backgroundTaskRegistry.abortAll();
            this.monitorRegistry.abortAll({ notify: false });
            this.backgroundShellRegistry.abortAll();
            this.workflowRunRegistry.abortAll();
            await this.cleanupArenaRuntime();
            await this.cleanupTeamRuntime();
        }
        catch (error) {
            this.debugLogger.error('Error during Config shutdown:', error);
            throw error;
        }
    }
    getPromptRegistry() {
        return this.promptRegistry;
    }
    getResourceRegistry() {
        return this.resourceRegistry;
    }
    getDebugMode() {
        return this.debugMode;
    }
    getQuestion() {
        return this.question;
    }
    getSystemPrompt() {
        return this.systemPrompt;
    }
    getAppendSystemPrompt() {
        const parts = [this.appendSystemPrompt, this.liveAppendSystemPrompt].filter((part) => Boolean(part?.trim()));
        return parts.length > 0 ? parts.join('\n\n') : undefined;
    }
    setLiveAppendSystemPrompt(prompt) {
        this.liveAppendSystemPrompt = prompt;
    }
    /** @deprecated Use getPermissionsAllow() instead. */
    getCoreTools() {
        if (this.getBareMode()) {
            return DEFAULT_BARE_CORE_TOOLS;
        }
        return this.coreTools;
    }
    /**
     * Returns the merged allow-rules for PermissionManager.
     *
     * This merges all sources so that PermissionManager receives a single,
     * authoritative list:
     *   - settings.permissions.allow (persistent rules from all scopes)
     *   - allowedTools param (SDK / argv auto-approve list)
     *
     * Note: coreTools is intentionally excluded here — it has whitelist semantics
     * (only listed tools are registered), not auto-approve semantics. It is
     * handled separately via PermissionManager.coreToolsAllowList.
     *
     * CLI callers (loadCliConfig) already pre-merge argv into permissionsAllow
     * before constructing Config, so those fields will be empty for CLI usage.
     * SDK callers construct Config directly and rely on allowedTools.
     */
    getPermissionsAllow() {
        const base = this.permissionsAllow ?? [];
        const sdkAllow = [...(this.allowedTools ?? [])];
        if (sdkAllow.length === 0)
            return base.length > 0 ? base : [];
        const merged = [...base];
        for (const t of sdkAllow) {
            if (t && !merged.includes(t))
                merged.push(t);
        }
        return merged;
    }
    getPermissionsAsk() {
        return this.permissionsAsk;
    }
    /**
     * Returns the merged deny-rules for PermissionManager.
     *
     * Merges:
     *   - settings.permissions.deny (persistent rules from all scopes)
     *   - excludeTools param (SDK / argv blocklist)
     *
     * CLI callers pre-merge argv.excludeTools into permissionsDeny.
     */
    getPermissionsDeny() {
        const base = this.permissionsDeny ?? [];
        const sdkDeny = this.excludeTools ?? [];
        if (sdkDeny.length === 0)
            return base.length > 0 ? base : [];
        const merged = [...base];
        for (const t of sdkDeny) {
            if (t && !merged.includes(t))
                merged.push(t);
        }
        return merged;
    }
    getToolDiscoveryCommand() {
        return this.toolDiscoveryCommand;
    }
    /**
     * Returns the pre-merged list of slash command names that should be hidden
     * from the CLI surface. Callers should treat this as a case-insensitive
     * denylist; `CommandService.create` handles the normalization.
     */
    getDisabledSlashCommands() {
        return this.disabledSlashCommands;
    }
    /**
     * Returns the live set of skill names that are currently disabled.
     * Unlike `getDisabledSlashCommands()` (frozen snapshot), this delegates
     * to the provider supplied at construction so the CLI's `LoadedSettings`
     * mutations are visible without restarting the process.
     *
     * Names are lower-cased. Empty set when no provider was supplied.
     */
    getDisabledSkillNames() {
        return this.disabledSkillNamesProvider?.() ?? EMPTY_DISABLED_SKILL_NAMES;
    }
    /**
     * Returns skill discovery levels excluded through
     * `settings.skills.disabledLevels`.
     */
    getDisabledSkillLevels() {
        return this.disabledSkillLevels;
    }
    /**
     * Returns additional skill directories from `settings.skills.directories`.
     * Paths are raw (unexpanded); consumers must handle `~` expansion
     * (see `SkillManager.getSkillsBaseDirs`).
     */
    getCustomSkillDirs() {
        return this.customSkillDirs;
    }
    /**
     * Returns the read-only set of tool names hidden from this Config's
     * ToolRegistry. Consulted by `ToolRegistry.registerTool` and
     * `ToolRegistry.registerFactory` to skip registration.
     *
     * Mutability semantics: the snapshot is
     * mutable via `setDisabledTools()` so the daemon's
     * `setWorkspaceToolEnabled` route can re-sync the set after a
     * `tools.disabled` settings write — without that sync, the
     * documented "toggle + restart" workflow would re-register the
     * just-disabled MCP tool against the bootstrap snapshot.
     *
     * Already-registered tools are NOT retroactively unregistered:
     * `ToolRegistry` consults the set at registration time only, so a
     * mid-session disable only takes effect on the next `registerTool`
     * call (next ACP child spawn, MCP rediscover, etc.). This matches
     * the documented "toggling does not unregister live tools"
     * contract.
     *
     * See `disabledTools` in ConfigParameters and `setDisabledTools`
     * for the runtime sync entry point.
     */
    getDisabledTools() {
        return this.disabledTools;
    }
    /**
     * Deferred-tool names that should be visible from session start.
     * Sourced from `settings.tools.visible`.
     *
     * These tools bypass `shouldDefer` in `getFunctionDeclarations()`
     * and are excluded from `getDeferredToolSummary()` so they appear
     * as first-class tools to the model.
     */
    getVisibleTools() {
        return this.visibleTools;
    }
    /**
     * Percentage of the context window used as the session-start budget for
     * preloading deferred tools. See
     * {@link ConfigParameters.toolSearchThreshold}.
     */
    getToolSearchThreshold() {
        return this.toolSearchThreshold;
    }
    /**
     * Replace the in-process `disabledTools`
     * snapshot with a fresh set sourced from the workspace settings.
     * Intended for the `qwen serve` mutation surface
     * (`setWorkspaceToolEnabled` → ACP `qwen/control/...` → here): the
     * settings file is the source of truth, and this setter keeps the
     * in-memory Config in sync so a subsequent MCP rediscovery / next
     * tool registration honors the just-toggled value.
     *
     * Already-registered tools are NOT retroactively unregistered
     * `ToolRegistry` consults the set at registration time only, which
     * matches the documented "toggling does not unregister live tools"
     * contract.
     */
    setDisabledTools(disabled) {
        this.disabledTools = new Set(disabled);
    }
    getToolCallCommand() {
        return this.toolCallCommand;
    }
    getMcpServerCommand() {
        return this.mcpServerCommand;
    }
    /**
     * optional workspace-shared MCP transport pool
     * injected by the daemon-mode `QwenAgent`. When set, the wrapping
     * `ToolRegistry` threads it into `McpClientManager`, which delegates
     * non-SDK MCP server discovery to the pool instead of spawning its
     * own per-session `McpClient`. Standalone `qwen` (non-daemon) leaves
     * this `undefined` and the manager keeps its previous behavior.
     *
     * Eagerly instantiated by `QwenAgent` (per Q6 resolved); the
     * pool itself is lazy w.r.t. actual MCP work — it spawns nothing
     * until the first `acquire()` from a session.
     */
    mcpTransportPool;
    setMcpTransportPool(pool) {
        this.mcpTransportPool = pool;
    }
    getMcpTransportPool() {
        return this.mcpTransportPool;
    }
    /**
     * T2.8: return the raw settings-layer MCP servers map (without the
     * runtime overlay or extension contributions). Used by
     * `McpClientManager.addRuntimeMcpServer` to detect shadow-over-
     * settings (a runtime entry whose name collides with a pre-existing
     * settings entry).
     */
    getSettingsMcpServers() {
        return this.mcpServers;
    }
    /**
     * Session-injected + `--mcp-config` ("top-tier") servers captured at boot, so
     * the hot-reload subscriber can re-assemble the effective MCP map exactly the
     * way boot did. See sub-task 3 and `assembleMcpServers`.
     */
    getTopTierMcpServers() {
        return this.topTierMcpServers;
    }
    /**
     * The merged MCP server map (settings + extensions + runtime overlay) WITHOUT
     * any admission filtering. `getMcpServers()` is this map with the
     * `allowedMcpServers` filter applied; the unfiltered form is what tells us a
     * server is "configured" regardless of allow-list / excluded / pending gating
     * (used to classify why a server is unavailable — see
     * {@link getMcpServerUnavailableReason}).
     */
    getMergedMcpServers() {
        const mcpServers = { ...(this.mcpServers || {}) };
        const extensions = this.getActiveExtensions();
        for (const extension of extensions) {
            Object.entries(extension.config.mcpServers || {}).forEach(([key, server]) => {
                if (mcpServers[key])
                    return;
                mcpServers[key] = {
                    ...server,
                    extensionName: extension.config.name,
                };
            });
        }
        // T2.8 — runtime layer wins over settings + extensions (shadow semantics)
        for (const [name, cfg] of this.runtimeMcpServers) {
            mcpServers[name] = cfg;
        }
        return mcpServers;
    }
    getMcpServers() {
        // Safe mode distrusts LOCAL/ambient state (settings.json, extensions,
        // project `.mcp.json`) — not the caller's own explicit, per-invocation
        // request. `topTierMcpServers` (ACP `session/new`'s `mcpServers` field,
        // `--mcp-config`) is that explicit request, so it survives safe mode;
        // everything `getMergedMcpServers()` would otherwise fold in does not.
        // Still runs through the `allowedMcpServers` filter below like any other
        // source — safe mode isn't an exemption from a session's own
        // `--allowed-mcp-server-names` upper bound (Copilot review, PR #7827).
        let mcpServers = this.isSafeMode()
            ? { ...this.topTierMcpServers }
            : this.getMergedMcpServers();
        if (this.allowedMcpServers) {
            mcpServers = Object.fromEntries(Object.entries(mcpServers).filter(([key]) => matchesAnyServerPattern(key, this.allowedMcpServers)));
        }
        // Note: We no longer filter out excluded servers here.
        // The UI layer should check isMcpServerDisabled() to determine
        // whether to show a server as disabled.
        return mcpServers;
    }
    getExcludedMcpServers() {
        return this.excludedMcpServers;
    }
    setExcludedMcpServers(excluded) {
        this.excludedMcpServers = excluded;
    }
    getMcpToolIdleTimeoutMs() {
        return this.mcpToolIdleTimeoutMs;
    }
    isMcpServerDisabled(serverName) {
        if (matchesAnyServerPattern(serverName, this.excludedMcpServers))
            return true;
        // Extension-bundled servers can be disabled individually via extension
        // preferences. Only the extension that actually contributed the server is
        // consulted, so a same-named server from another source (e.g. a shadowing
        // user config) is never affected. The owner lookup mirrors the
        // getMcpServers() merge (user/project config wins, then first active
        // extension) without rebuilding the merged map — this predicate runs per
        // server in discovery loops and on every resource read.
        if (this.mcpServers?.[serverName])
            return false;
        for (const extension of this.getActiveExtensions()) {
            if (extension.config.mcpServers?.[serverName]) {
                return (this.extensionManager
                    ?.getDisabledMcpServers(extension.config.name)
                    .includes(serverName) ?? false);
            }
        }
        return false;
    }
    /**
     * True for a project-scoped (`.mcp.json`) server that the user has not
     * approved (pending or rejected). The discovery layer skips these BEFORE any
     * stdio spawn / transport / health check, so inspecting an untrusted
     * `.mcp.json` has no side effects. See issue #4615.
     */
    isMcpServerPendingApproval(serverName) {
        return this.pendingMcpServers?.includes(serverName) ?? false;
    }
    /**
     * Drop a project server from the pending-approval set after the user approves
     * it mid-session (via the startup dialog), so a subsequent
     * `discoverToolsForServer` connects it instead of skipping it. See issue
     * #4615. No-op for servers that were never pending.
     */
    approveMcpServerForSession(serverName) {
        if (!this.pendingMcpServers) {
            return;
        }
        this.pendingMcpServers = this.pendingMcpServers.filter((name) => name !== serverName);
    }
    addMcpServers(servers) {
        if (this.initialized) {
            throw new Error('Cannot modify mcpServers after initialization');
        }
        this.mcpServers = { ...this.mcpServers, ...servers };
    }
    /**
     * Replace the settings-layer MCP server map at runtime (hot-reload).
     * Unlike {@link addMcpServers}, this bypasses the `initialized` guard and
     * REPLACES (not merges) so removals take effect. The runtime overlay
     * ({@link addRuntimeMcpServer}) and extension contributions are unaffected —
     * {@link getMcpServers} still layers them on top. See sub-task 3.
     */
    setMcpServers(servers) {
        this.mcpServers = servers;
    }
    /**
     * Replace the allow-list of MCP server names at runtime (hot-reload). When
     * set, {@link getMcpServers} only yields servers whose name is in this list.
     * `allowedMcpServers` is consulted as a filter inside `getMcpServers()`, so
     * without this setter an allow-list edit would silently require a restart.
     */
    setAllowedMcpServers(allowed) {
        this.allowedMcpServers = allowed;
    }
    getAllowedMcpServers() {
        return this.allowedMcpServers;
    }
    /**
     * The startup `--allowed-mcp-server-names` upper bound (the CLI flag only),
     * or undefined if the flag was not passed. The hot-reload recompute caps the
     * settings-derived allow-list to this so a runtime settings edit can narrow
     * MCP admission but never widen it beyond what the launch flag permitted.
     */
    getCliAllowedMcpServerNames() {
        return this.cliAllowedMcpServerNames;
    }
    /**
     * Replace the pending-approval set of gated MCP server names at runtime
     * (hot-reload). The discovery layer skips these BEFORE any connection side
     * effect, so a hot-reload must recompute them (#4615) lest it connect a
     * newly-added but unapproved `.mcp.json`/workspace server.
     */
    setPendingMcpServers(pending) {
        this.pendingMcpServers = pending;
    }
    /**
     * Snapshot of the three connection-admission lists consulted by discovery,
     * used by the hot-reload subscriber as the pre-image to diff against. Paired
     * with {@link setExcludedMcpServers} / {@link setAllowedMcpServers} /
     * {@link setPendingMcpServers}.
     */
    getMcpGating() {
        return {
            excluded: this.excludedMcpServers,
            allowed: this.allowedMcpServers,
            pending: this.pendingMcpServers,
        };
    }
    /**
     * Names of MCP servers removed from config during this session by a runtime
     * reconcile and not since re-added. "Removed" means gone from the merged map
     * (settings + extensions + runtime), NOT merely filtered out by an admission
     * gate — a server that is still configured but excluded / not-allowed /
     * pending is reported via {@link getMcpServerUnavailableReason} instead.
     * Consumed by the tool-not-found path.
     */
    getRecentlyRemovedMcpServers() {
        return [...this.recentlyRemovedMcpServers];
    }
    /** All configured MCP server names (merged, before admission gating). */
    getMcpServerNames() {
        return Object.keys(this.getMergedMcpServers());
    }
    /**
     * Why a given MCP server is currently unavailable (its tools aren't usable),
     * or `undefined` if it is configured and admitted (so a missing tool is a
     * genuine "not found" / disconnected, not an admission decision). Lets the
     * tool-not-found path explain the right recovery action. Covers every
     * admission gate:
     * - `removed`: deleted from config this session (see
     *   {@link getRecentlyRemovedMcpServers}).
     * - `not_allowed`: filtered out by the `mcp.allowed` allow-list.
     * - `excluded`: in the `mcp.excluded` list.
     * - `pending_approval`: a gated server awaiting approval (#4615).
     */
    getMcpServerUnavailableReason(serverName) {
        if (this.recentlyRemovedMcpServers.has(serverName))
            return 'removed';
        if (!(serverName in this.getMergedMcpServers()))
            return undefined;
        if (this.allowedMcpServers &&
            !matchesAnyServerPattern(serverName, this.allowedMcpServers)) {
            return 'not_allowed';
        }
        if (matchesAnyServerPattern(serverName, this.excludedMcpServers))
            return 'excluded';
        if (this.isMcpServerPendingApproval(serverName))
            return 'pending_approval';
        return undefined;
    }
    /**
     * Apply a new settings-layer MCP map and incrementally reconcile live
     * connections (connect added, disconnect removed, restart changed; unchanged
     * servers untouched). Safe no-op before {@link initialize}. A shared
     * "reconcile in progress" guard serializes against a concurrent caller (e.g.
     * `/reload`): a request arriving mid-flight is coalesced into a single
     * follow-up pass so the latest config always wins. See sub-task 3.
     */
    async reinitializeMcpServers(servers) {
        this.debugLogger.debug(`[mcp-hot-reload] reinitializeMcpServers: servers=[${Object.keys(servers ?? {}).join(', ')}] initialized=${this.initialized} inProgress=${this.mcpReconcileInProgress}`);
        // Track which servers were DELETED from config this session (gone from the
        // merged map), so the tool-not-found path can say "removed this session"
        // vs an admission-gate reason. The merged map is independent of the
        // admission gates (allowed/excluded/pending), so the diff is unaffected by
        // the gating setters the hot-reload caller applied just before this — no
        // pre-gating snapshot needed. Re-added names self-heal.
        const prevConfigured = new Set(Object.keys(this.getMergedMcpServers()));
        this.setMcpServers(servers);
        const nextConfigured = new Set(Object.keys(this.getMergedMcpServers()));
        for (const name of nextConfigured) {
            this.recentlyRemovedMcpServers.delete(name);
        }
        for (const name of prevConfigured) {
            if (!nextConfigured.has(name)) {
                this.recentlyRemovedMcpServers.add(name);
            }
        }
        await this.refreshMcpServers();
    }
    async refreshMcpServers() {
        if (!this.initialized) {
            // No tool registry yet — boot-time discovery will pick up the new map.
            this.debugLogger.debug('[mcp-hot-reload] not initialized yet — deferring to boot-time discovery (no-op)');
            return;
        }
        if (this.mcpReconcileInProgress) {
            // Coalesce: a pass is already running. Mark that the desired state
            // advanced so its drain loop runs again with the latest config, and
            // await that in-flight pass — NOT a resolved promise — so this caller
            // does not proceed before its coalesced change is actually reconciled.
            this.mcpReconcilePending = true;
            this.debugLogger.debug('[mcp-hot-reload] reconcile already in flight — coalescing into a follow-up pass');
            return this.mcpReconcilePromise ?? Promise.resolve();
        }
        this.mcpReconcileInProgress = true;
        const registry = this.getToolRegistry();
        // Assign before the first await so a coalesced caller can await this pass.
        const runReconcile = (async () => {
            try {
                this.debugLogger.debug('[mcp-hot-reload] running incremental reconcile (pass 1)');
                await registry
                    .getMcpClientManager()
                    .discoverAllMcpToolsIncremental(this);
                // The pool path returns an in-flight promise, so re-run after any
                // coalesced change to ensure the latest effective config is applied.
                let pass = 1;
                while (this.mcpReconcilePending) {
                    this.mcpReconcilePending = false;
                    pass += 1;
                    this.debugLogger.debug(`[mcp-hot-reload] running coalesced incremental reconcile (pass ${pass})`);
                    await registry
                        .getMcpClientManager()
                        .discoverAllMcpToolsIncremental(this);
                }
                this.debugLogger.debug(`[mcp-hot-reload] reconcile complete after ${pass} pass(es); live servers=[${Object.keys(this.getMcpServers() ?? {}).join(', ')}]`);
            }
            catch (err) {
                this.debugLogger.error(`[mcp-hot-reload] reconcile failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
                throw err;
            }
            finally {
                this.mcpReconcileInProgress = false;
                // A failed pass must not leak a pending drain into the next reconcile.
                this.mcpReconcilePending = false;
                this.mcpReconcilePromise = undefined;
            }
        })();
        this.mcpReconcilePromise = runReconcile;
        // Propagate failure to this caller and every coalesced caller.
        await runReconcile;
    }
    /**
     * Add a runtime-only MCP server. Unlike `addMcpServers`, this does NOT
     * touch `this.mcpServers` (settings layer) and does not enforce the
     * `initialized` guard — the whole point is post-init mutation from the
     * daemon surface. `getMcpServers()` will overlay these entries on top
     * of the settings layer (Task 5).
     */
    addRuntimeMcpServer(name, config) {
        this.runtimeMcpServers.set(name, config);
    }
    /**
     * Snapshot the runtime-only MCP servers added via `addRuntimeMcpServer`.
     * Returns a shallow copy so callers can't mutate the private map.
     *
     * Reverse tool channel (issue #5626): a per-session Config built by
     * `newSessionConfig` is independent from the bootstrap/workspace Config and
     * never re-reads runtime additions (they live outside the settings layer
     * `loadCliConfig` reloads). The daemon uses this getter to propagate the
     * bootstrap Config's runtime MCP servers into a freshly created session
     * Config so a session created AFTER a client MCP server was registered still
     * discovers the client-hosted tools. Empty when nothing was runtime-added,
     * so the inheritance step is a no-op in the common case.
     */
    getRuntimeMcpServers() {
        return Object.fromEntries(this.runtimeMcpServers);
    }
    /**
     * Remove a runtime-only MCP server previously added via
     * `addRuntimeMcpServer`. Returns `true` if the entry existed and was
     * removed, `false` otherwise.
     */
    removeRuntimeMcpServer(name) {
        return this.runtimeMcpServers.delete(name);
    }
    isLspEnabled() {
        return this.lspEnabled && !this.getBareMode();
    }
    getLspClient() {
        return this.lspClient;
    }
    getLspStatusSnapshot() {
        if (!this.isLspEnabled()) {
            return this.createLspStatusSnapshot(false);
        }
        const clientSnapshot = this.lspClient?.getStatusSnapshot?.();
        if (clientSnapshot) {
            return {
                ...clientSnapshot,
                enabled: true,
                initializationError: this.lspInitializationError ?? clientSnapshot.initializationError,
            };
        }
        if (this.lspClient) {
            return {
                ...this.createLspStatusSnapshot(true, this.lspInitializationError),
                statusUnavailable: true,
            };
        }
        return this.createLspStatusSnapshot(true, this.lspInitializationError ?? 'LSP client is not initialized');
    }
    createLspStatusSnapshot(enabled, initializationError) {
        return {
            enabled,
            configuredServers: 0,
            readyServers: 0,
            failedServers: 0,
            inProgressServers: 0,
            notStartedServers: 0,
            servers: [],
            ...(initializationError ? { initializationError } : {}),
        };
    }
    /**
     * Allows wiring an LSP client after Config construction but before initialize().
     */
    setLspClient(client) {
        if (this.initialized) {
            throw new Error('Cannot set LSP client after initialization');
        }
        this.lspClient = client;
    }
    setLspInitializationError(error) {
        if (this.initialized) {
            throw new Error('Cannot set LSP status after initialization');
        }
        this.setRuntimeLspInitializationError(error);
    }
    setRuntimeLspInitializationError(error) {
        this.lspInitializationError =
            error instanceof Error ? error.message : error;
    }
    async reinitializeLsp() {
        if (!this.isLspEnabled() || !this.lspClient?.reinitialize) {
            return undefined;
        }
        try {
            const result = await this.lspClient.reinitialize();
            if (result.reconcile.failed.length > 0) {
                this.setRuntimeLspInitializationError(`LSP reload partially failed: ${result.reconcile.failed.join(', ')}`);
            }
            else {
                this.setRuntimeLspInitializationError(undefined);
            }
            return result;
        }
        catch (error) {
            this.setRuntimeLspInitializationError(error instanceof Error ? error : String(error));
            throw error;
        }
    }
    getSessionSubagents() {
        return this.sessionSubagents;
    }
    setSessionSubagents(subagents) {
        if (this.initialized) {
            throw new Error('Cannot modify sessionSubagents after initialization');
        }
        this.sessionSubagents = subagents;
    }
    getSdkMode() {
        return this.sdkMode;
    }
    setSdkMode(value) {
        this.sdkMode = value;
    }
    getUserMemory() {
        return this.userMemory;
    }
    getStaticSystemPrefix() {
        return this.staticSystemPrefix;
    }
    setStaticSystemPrefix(prefix) {
        this.staticSystemPrefix = prefix;
    }
    /**
     * The managed auto-memory section of the system prompt (volatile layer).
     * Empty when managed memory is unavailable. Callers assembling a system
     * prompt must append this after all stable/context content.
     */
    getAutoMemoryPrompt() {
        return this.autoMemoryPrompt;
    }
    getOutputLanguageFilePath() {
        return this.outputLanguageFilePath;
    }
    setOutputLanguageFilePath(filePath) {
        this.outputLanguageFilePath = filePath;
    }
    setUserMemory(newUserMemory) {
        this.userMemory = newUserMemory;
    }
    getGeminiMdFileCount() {
        return this.geminiMdFileCount;
    }
    setGeminiMdFileCount(count) {
        this.geminiMdFileCount = count;
    }
    /** Display paths of the currently loaded context (memory) files. */
    getContextFilePaths() {
        return this.loadedContextFilePaths;
    }
    setContextFilePaths(paths) {
        this.loadedContextFilePaths = paths;
    }
    getArenaManager() {
        return this.arenaManager;
    }
    setArenaManager(manager) {
        this.arenaManager = manager;
        this.arenaManagerChangeCallback?.(manager);
    }
    /**
     * Register a callback invoked whenever the arena manager changes.
     * Pass `null` to unsubscribe. Only one subscriber is supported.
     */
    onArenaManagerChange(cb) {
        this.arenaManagerChangeCallback = cb;
    }
    getArenaAgentClient() {
        return this.arenaAgentClient;
    }
    getAgentsSettings() {
        return this.agentsSettings;
    }
    // ─── Team Manager ──────────────────────────────────────────
    getTeamManager() {
        return this.teamManager;
    }
    setTeamManager(manager) {
        this.teamManager = manager;
        for (const cb of this.teamManagerChangeCallbacks) {
            cb(manager);
        }
    }
    /**
     * Register a callback invoked whenever the team manager changes.
     * Pass `null` to unsubscribe a previously registered callback.
     * Multiple subscribers are supported.
     */
    onTeamManagerChange(cb, previous) {
        if (previous) {
            this.teamManagerChangeCallbacks.delete(previous);
        }
        if (cb) {
            this.teamManagerChangeCallbacks.add(cb);
        }
    }
    getTeamContext() {
        return this.teamContext;
    }
    setTeamContext(ctx) {
        this.teamContext = ctx;
    }
    /**
     * Clean up Team runtime — stops all teammates and clears state.
     */
    async cleanupTeamRuntime() {
        const manager = this.teamManager;
        if (!manager) {
            return;
        }
        await manager.cleanup();
        this.setTeamManager(null);
        this.setTeamContext(null);
    }
    /**
     * Convenience accessor for `worktree.symlinkDirectories` — returns an
     * empty array when the setting is unset, so callers can pass the
     * result directly into the GitWorktreeService loop without nullchecks.
     *
     * (No general `getWorktreeSettings()` getter yet — add one when a
     * second field on `WorktreeSettings` justifies the broader API.)
     */
    getWorktreeSymlinkDirectories() {
        return this.worktreeSettings.symlinkDirectories ?? [];
    }
    /**
     * Clean up Arena runtime. When `force` is true (e.g., /arena select --discard),
     * always removes worktrees regardless of preserveArtifacts.
     */
    async cleanupArenaRuntime(force) {
        const manager = this.arenaManager;
        if (!manager) {
            return;
        }
        if (!force && this.agentsSettings.arena?.preserveArtifacts) {
            await manager.cleanupRuntime();
        }
        else {
            await manager.cleanup();
        }
        this.setArenaManager(null);
    }
    getApprovalMode() {
        return this.approvalMode;
    }
    /**
     * Returns the AUTO approval mode classifier settings (hints + environment).
     * Returns an empty object when no settings are configured.
     */
    getAutoModeSettings() {
        return this.permissionsAutoMode;
    }
    /**
     * Returns the AUTO mode denialTracking state for the current session.
     * Used by the scheduler to decide whether to fall back from classifier
     * evaluation to manual approval. Session-scoped, never persisted.
     */
    getAutoModeDenialState() {
        return this.autoModeDenialState;
    }
    /**
     * Replace the AUTO mode denialTracking state. Caller produces the new
     * state via one of the pure transitions in `permissions/denialTracking.ts`
     * (recordAllow / recordBlock / recordUnavailable / recordFallback*).
     */
    setAutoModeDenialState(state) {
        this.autoModeDenialState = state;
    }
    /**
     * Returns the approval mode that was active before entering plan mode.
     * Falls back to DEFAULT if no pre-plan mode was recorded.
     */
    getPrePlanMode() {
        return this.prePlanMode ?? ApprovalMode.DEFAULT;
    }
    getApprovalModeRevision() {
        return this.approvalModeRevision;
    }
    getManualPlanExitNoticeEventState() {
        if (!Object.prototype.hasOwnProperty.call(this, 'manualPlanExitNoticeEventState') &&
            Object.prototype.hasOwnProperty.call(this, 'approvalMode')) {
            const inheritedEvent = this.manualPlanExitNoticeEventState;
            this.manualPlanExitNoticeEventState = inheritedEvent
                ? { ...inheritedEvent }
                : { version: 0, kind: 'clear' };
        }
        return this.manualPlanExitNoticeEventState;
    }
    getOwnManualPlanExitNoticeCursorState() {
        if (!Object.prototype.hasOwnProperty.call(this, 'manualPlanExitNoticeCursorState')) {
            this.manualPlanExitNoticeCursorState = { seenVersion: 0 };
        }
        return this.manualPlanExitNoticeCursorState;
    }
    setApprovalMode(mode, options) {
        if (!this.isTrustedFolder() &&
            mode !== ApprovalMode.DEFAULT &&
            mode !== ApprovalMode.PLAN) {
            throw new TrustGateError('Cannot enable privileged approval modes in an untrusted folder.');
        }
        // Strip over-broad allow rules (Bash interpreter wildcards, any Agent /
        // Skill allow) on AUTO entry; restore them on AUTO exit. Settings on
        // disk are NEVER touched — this is a runtime-only adjustment of the
        // active PermissionManager rule set. The PermissionManager is `null`
        // until initialize() is called, so skip the hook on early-startup
        // mode changes (the strip will happen via initialize for AUTO-default
        // sessions).
        const fromMode = this.approvalMode;
        if (this.permissionManager) {
            if (mode === ApprovalMode.AUTO && fromMode !== ApprovalMode.AUTO) {
                this.permissionManager.stripDangerousRulesForAutoMode();
            }
            else if (fromMode === ApprovalMode.AUTO && mode !== ApprovalMode.AUTO) {
                this.permissionManager.restoreDangerousRules();
            }
        }
        // Update all mode bookkeeping only after fallible transition work has
        // succeeded, so callers never observe a partially applied mode change.
        let noticeEvent = Config.prototype.getManualPlanExitNoticeEventState.call(this);
        if (!Object.prototype.hasOwnProperty.call(this, 'approvalMode')) {
            noticeEvent = { ...noticeEvent };
            this.manualPlanExitNoticeEventState = noticeEvent;
        }
        if (mode === ApprovalMode.PLAN && fromMode !== ApprovalMode.PLAN) {
            this.prePlanMode = fromMode;
            noticeEvent.version++;
            noticeEvent.kind = 'clear';
        }
        else if (mode !== ApprovalMode.PLAN && fromMode === ApprovalMode.PLAN) {
            this.prePlanMode = undefined;
            noticeEvent.version++;
            noticeEvent.kind = options?.fromApprovedPlanExit
                ? 'clear'
                : 'manual-exit';
        }
        // Any deliberate mode change invalidates the AUTO denialTracking signal.
        if (fromMode !== mode) {
            this.autoModeDenialState = resetDenialState();
        }
        this.approvalMode = mode;
        if (fromMode !== mode) {
            this.approvalModeRevision++;
        }
    }
    /**
     * Claims the latest manual plan-exit notice for this conversation.
     */
    takePendingManualPlanExitNotice() {
        const event = Config.prototype.getManualPlanExitNoticeEventState.call(this);
        const cursor = Config.prototype.getOwnManualPlanExitNoticeCursorState.call(this);
        if (event.version <= cursor.seenVersion) {
            return undefined;
        }
        cursor.seenVersion = event.version;
        if (event.kind !== 'manual-exit' ||
            this.approvalMode === ApprovalMode.PLAN) {
            return undefined;
        }
        return {
            version: event.version,
            currentMode: this.approvalMode,
        };
    }
    restorePendingManualPlanExitNotice(version) {
        const event = Config.prototype.getManualPlanExitNoticeEventState.call(this);
        const cursor = Config.prototype.getOwnManualPlanExitNoticeCursorState.call(this);
        if (event.version === version &&
            event.kind === 'manual-exit' &&
            this.approvalMode !== ApprovalMode.PLAN &&
            cursor.seenVersion === version) {
            cursor.seenVersion = Math.max(0, version - 1);
        }
    }
    consumePendingManualPlanExitNotice() {
        return (Config.prototype.takePendingManualPlanExitNotice.call(this) !== undefined);
    }
    /**
     * Returns the directory where this session's plan file is stored.
     */
    getPlansDir() {
        return this.plansDir;
    }
    assertPlansDirWithinTargetDir() {
        if (!this.plansDirectoryConfigured) {
            return;
        }
        Storage.assertPathWithinDirectory(this.plansDir, this.targetDir, `plansDirectory must resolve within the project root.`);
    }
    assertPlanFilePathWithinTargetDir(filePath) {
        if (!this.plansDirectoryConfigured) {
            return;
        }
        Storage.assertPathWithinDirectory(filePath, this.targetDir, `plansDirectory must resolve within the project root.`);
    }
    addLegacyPlanLocationWarning() {
        try {
            if (!this.plansDirectoryConfigured) {
                return;
            }
            const legacyPlansDir = Storage.getPlansDir();
            const legacyPlanFiles = this.getPlanFileNames(legacyPlansDir);
            if (legacyPlanFiles.length === 0) {
                return;
            }
            const configuredPlanFiles = new Set(this.getPlanFileNames(this.plansDir));
            const hiddenLegacyPlanFiles = legacyPlanFiles.filter((fileName) => !configuredPlanFiles.has(fileName));
            if (hiddenLegacyPlanFiles.length === 0) {
                return;
            }
            this.warnings.push(`Warning: Saved plan files exist at ${legacyPlansDir}, but ` +
                `plansDirectory is configured to use ${this.plansDir}. Move ` +
                `existing plan files to ${this.plansDir} if you want to keep ` +
                `using them.`);
        }
        catch (err) {
            const message = `Failed to check legacy plan directory migration warning: ${err instanceof Error ? err.message : String(err)}`;
            this.warnings.push(message);
            this.debugLogger.warn(message, err);
        }
    }
    getPlanFileNames(plansDir) {
        try {
            return fs.readdirSync(plansDir).filter((entry) => entry.endsWith('.md'));
        }
        catch (err) {
            const code = err.code;
            if (code === 'ENOENT') {
                return [];
            }
            if (code === 'EACCES' || code === 'EPERM') {
                const message = `Failed to read plan directory ${plansDir}: ${err instanceof Error ? err.message : String(err)}`;
                this.warnings.push(message);
                this.debugLogger.warn(message, err);
                return [];
            }
            throw err;
        }
    }
    /**
     * Returns the file path for this session's plan file.
     */
    getPlanFilePath() {
        return path.join(this.plansDir, `${Storage.sanitizePlanSessionId(this.sessionId)}.md`);
    }
    /**
     * Saves a plan to disk for the current session.
     */
    savePlan(plan) {
        this.assertPlansDirWithinTargetDir();
        const filePath = this.getPlanFilePath();
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        // Write to a temp file first, then atomically rename to avoid
        // leaving a corrupted file if the process crashes mid-write.
        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, plan, 'utf-8');
        try {
            fs.renameSync(tmpPath, filePath);
        }
        catch (err) {
            if (err.code !== 'EXDEV') {
                throw err;
            }
            fs.copyFileSync(tmpPath, filePath);
            fs.unlinkSync(tmpPath);
        }
        try {
            this.assertPlanFilePathWithinTargetDir(filePath);
        }
        catch (err) {
            try {
                fs.unlinkSync(filePath);
            }
            catch {
                // Ignore rollback errors; the containment check already failed.
            }
            throw err;
        }
    }
    /**
     * Loads the plan for the current session, or returns undefined if none exists.
     */
    loadPlan() {
        this.assertPlansDirWithinTargetDir();
        const filePath = this.getPlanFilePath();
        this.assertPlanFilePathWithinTargetDir(filePath);
        try {
            return fs.readFileSync(filePath, 'utf-8');
        }
        catch (error) {
            if (typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }
    getInputFormat() {
        return this.inputFormat;
    }
    getIncludePartialMessages() {
        return this.includePartialMessages;
    }
    getAccessibility() {
        return this.accessibility;
    }
    getShowResponseTokensPerSecond() {
        return this.showResponseTokensPerSecond;
    }
    getTelemetryEnabled() {
        return this.telemetrySettings.enabled ?? false;
    }
    isTelemetryInitializationDeferred() {
        return this.telemetryInitializationDeferred;
    }
    getTelemetryLogPromptsEnabled() {
        return this.telemetrySettings.logPrompts ?? true;
    }
    getTelemetryUserId() {
        return this.telemetrySettings.userId;
    }
    getTelemetryIncludeSensitiveSpanAttributes() {
        return this.telemetrySettings.includeSensitiveSpanAttributes ?? false;
    }
    getTelemetrySensitiveSpanAttributeMaxLength() {
        return this.telemetrySettings.sensitiveSpanAttributeMaxLength;
    }
    getTelemetryOtlpEndpoint() {
        return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
    }
    getTelemetryOtlpProtocol() {
        return this.telemetrySettings.otlpProtocol ?? 'grpc';
    }
    getTelemetryOtlpTracesEndpoint() {
        return this.telemetrySettings.otlpTracesEndpoint;
    }
    getTelemetryOtlpLogsEndpoint() {
        return this.telemetrySettings.otlpLogsEndpoint;
    }
    getTelemetryOtlpMetricsEndpoint() {
        return this.telemetrySettings.otlpMetricsEndpoint;
    }
    getTelemetryTarget() {
        return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
    }
    getTelemetryResourceAttributes() {
        return this.telemetrySettings.resourceAttributes ?? {};
    }
    getTelemetryMetricsIncludeSessionId() {
        return this.telemetrySettings.metrics?.includeSessionId ?? false;
    }
    getTelemetryResourceAttributeWarnings() {
        return this.telemetrySettings.resourceAttributeWarnings ?? [];
    }
    /**
     * Whether to inject W3C `traceparent` on outbound `fetch` requests
     * (LLM SDKs, MCP, WebFetch, etc.). Default false — see
     * `OutboundCorrelationSettings` for rationale.
     */
    getOutboundCorrelationPropagateTraceContext() {
        return this.outboundCorrelationSettings.propagateTraceContext ?? false;
    }
    getTelemetryOutfile() {
        return this.telemetrySettings.outfile;
    }
    getGitCoAuthor() {
        return this.gitCoAuthor;
    }
    getGeminiClient() {
        return this.geminiClient;
    }
    getOwnActiveTodoReminders() {
        if (!Object.prototype.hasOwnProperty.call(this, 'activeTodoReminders')) {
            this.activeTodoReminders = new Map();
        }
        return this.activeTodoReminders;
    }
    getOwnActiveTodoWorkChainOwners() {
        if (!Object.prototype.hasOwnProperty.call(this, 'activeTodoWorkChainOwners')) {
            this.activeTodoWorkChainOwners = new Map();
        }
        return this.activeTodoWorkChainOwners;
    }
    getOwnActiveTodoReminderTurns() {
        if (!Object.prototype.hasOwnProperty.call(this, 'activeTodoReminderTurns')) {
            this.activeTodoReminderTurns = new Map();
        }
        return this.activeTodoReminderTurns;
    }
    getActiveTodoWorkChainOwner(promptId, fallbackOwner = promptId) {
        return (this.getOwnActiveTodoWorkChainOwners().get(promptId) ?? fallbackOwner);
    }
    getActiveTodoReminder(promptId) {
        return this.getOwnActiveTodoReminders().get(this.getActiveTodoWorkChainOwner(promptId));
    }
    /**
     * Reads the reminder for injection, re-issuing it only every
     * ACTIVE_TODO_REMINDER_REFRESH_TURNS tool turns: each injected copy lands in
     * chat history permanently, so per-turn injection would grow the context
     * linearly with tool turns. `force` is for turn-start injections (retry /
     * related automatic turns), which always need the context and reset the
     * cadence.
     */
    takeActiveTodoReminder(promptId, force = false) {
        const owner = this.getActiveTodoWorkChainOwner(promptId);
        const reminder = this.getOwnActiveTodoReminders().get(owner);
        if (!reminder)
            return undefined;
        const turns = this.getOwnActiveTodoReminderTurns();
        const elapsed = (turns.get(owner) ?? 0) + 1;
        if (!force && elapsed < ACTIVE_TODO_REMINDER_REFRESH_TURNS) {
            turns.set(owner, elapsed);
            return undefined;
        }
        turns.set(owner, 0);
        return reminder;
    }
    setActiveTodoReminder(promptId, reminder) {
        const reminders = this.getOwnActiveTodoReminders();
        const owner = this.getActiveTodoWorkChainOwner(promptId);
        if (reminder) {
            reminders.set(owner, reminder);
            // The todo_write result itself just presented the full state.
            this.getOwnActiveTodoReminderTurns().set(owner, 0);
        }
        else {
            reminders.delete(owner);
            this.getOwnActiveTodoReminderTurns().delete(owner);
        }
    }
    startActiveTodoWorkChain(promptId, continuedFrom) {
        const reminders = this.getOwnActiveTodoReminders();
        const owners = this.getOwnActiveTodoWorkChainOwners();
        if (!continuedFrom) {
            reminders.clear();
            owners.clear();
            this.getOwnActiveTodoReminderTurns().clear();
            owners.set(promptId, promptId);
            return;
        }
        const owner = this.getActiveTodoWorkChainOwner(continuedFrom);
        for (const reminderOwner of reminders.keys()) {
            if (reminderOwner !== owner)
                reminders.delete(reminderOwner);
        }
        owners.clear();
        owners.set(promptId, owner);
    }
    startAutomaticActiveTodoWorkChain(promptId, continuedFrom) {
        const reminders = this.getOwnActiveTodoReminders();
        const owners = this.getOwnActiveTodoWorkChainOwners();
        const owner = continuedFrom
            ? this.getActiveTodoWorkChainOwner(continuedFrom)
            : promptId;
        owners.set(promptId, owner);
        if (owner === promptId)
            reminders.delete(owner);
    }
    endAutomaticActiveTodoWorkChain(promptId) {
        const owners = this.getOwnActiveTodoWorkChainOwners();
        const owner = this.getActiveTodoWorkChainOwner(promptId);
        owners.delete(promptId);
        if (![...owners.values()].includes(owner)) {
            this.getOwnActiveTodoReminders().delete(owner);
        }
    }
    /**
     * Session-scoped memory pressure monitor. Child Configs created with
     * `Object.create(parent)` inherit the parent's monitor through the prototype
     * chain until this getter installs an own monitor backed by the inherited
     * pressure config snapshot. This mirrors getFileReadCache()'s isolation
     * contract while keeping type-safe direct field assignment inside the class.
     */
    getMemoryPressureMonitor() {
        if (!Object.prototype.hasOwnProperty.call(this, 'memoryPressureMonitor')) {
            const inheritedMonitor = this.memoryPressureMonitor;
            if (inheritedMonitor) {
                const inheritedConfig = this.memoryPressureConfig;
                if (!inheritedConfig) {
                    throw new Error('Inherited memory pressure monitor is missing config');
                }
                this.memoryPressureConfig = { ...inheritedConfig };
                this.memoryPressureMonitor = new MemoryPressureMonitor(this, this.memoryPressureConfig);
            }
        }
        return this.memoryPressureMonitor;
    }
    getCronScheduler() {
        if (!this.cronScheduler) {
            this.cronScheduler = new CronScheduler(this.getProjectRoot(), this.getCronRecurringMaxAgeDays() * 24 * 60 * 60 * 1000);
        }
        return this.cronScheduler;
    }
    /**
     * Days a recurring cron job lives before auto-expiring; `Infinity`
     * means no expiry. Resolved once at construction (see
     * `resolveCronRecurringMaxAgeDays`) so mid-session env changes cannot
     * make the tool description, tool output, and scheduler disagree.
     */
    getCronRecurringMaxAgeDays() {
        return this.cronRecurringMaxAgeDays;
    }
    isCronEnabled() {
        if (process.env['QWEN_CODE_DISABLE_CRON'] === '1')
            return false;
        return this.cronEnabled;
    }
    /**
     * Whether the built-in `list_directory` tool is enabled. Opt-in: the tool
     * is disabled by default and turns on either through the
     * `tools.listDirectory.enabled` setting or by being explicitly listed in
     * the `coreTools` allowlist. Entries are normalised with `parseRule` — the
     * same parser `PermissionManager` uses to build its allowlist — so alias
     * forms (`ListFiles`) and specifier forms (`list_directory(/src)`) match.
     */
    isLsToolEnabled() {
        if (this.lsToolEnabled)
            return true;
        return (this.getCoreTools()?.some((name) => parseRule(name).toolName === ToolNames.LS) ?? false);
    }
    isAgentTeamEnabled() {
        // Agent team is experimental and opt-in: enabled via settings or env var
        if (process.env['QWEN_CODE_ENABLE_AGENT_TEAM'] === '1')
            return true;
        return this.agentTeamEnabled;
    }
    isArtifactEnabled() {
        // Publishing writes outside the project and opens a browser, so it is
        // limited to interactive, non-SDK sessions. QWEN_CODE_DISABLE_ARTIFACT
        // hard-disables both artifact tools; QWEN_CODE_ENABLE_ARTIFACT remains as
        // a compatibility override for old configs that explicitly disabled them.
        if (process.env['QWEN_CODE_DISABLE_ARTIFACT'] === '1')
            return false;
        if (this.sdkMode)
            return false;
        if (!this.interactive)
            return false;
        if (process.env['QWEN_CODE_ENABLE_ARTIFACT'] === '1')
            return true;
        return this.artifactEnabled;
    }
    isRecordArtifactEnabled() {
        if (process.env['QWEN_CODE_DISABLE_ARTIFACT'] === '1')
            return false;
        if (this.sdkMode)
            return false;
        if (process.env['QWEN_CODE_ENABLE_ARTIFACT'] === '1')
            return true;
        return this.artifactEnabled;
    }
    getArtifactPublisherKind() {
        return this.artifactPublisher;
    }
    getArtifactHostConfig() {
        return this.artifactHost;
    }
    getArtifactOssConfig() {
        return this.artifactOss;
    }
    resolveImageGenerationModel(setting) {
        const parsedSetting = parseVisionModelSetting(setting);
        if (!parsedSetting)
            return undefined;
        let selector;
        try {
            selector = resolveModelId(parsedSetting.selector);
        }
        catch {
            return undefined;
        }
        if (!selector)
            return undefined;
        const routeMatches = this.getAllConfiguredModels().filter((model) => model.imageOnly === true &&
            !model.fastOnly &&
            !model.voiceOnly &&
            model.id === selector.modelId &&
            (!selector.authType || model.authType === selector.authType) &&
            (!parsedSetting.baseUrl || model.baseUrl === parsedSetting.baseUrl));
        if (routeMatches.length !== 1)
            return undefined;
        const match = routeMatches[0];
        const apiKeyEnv = match.envKey?.trim();
        const configuredBaseUrl = match.registryBaseUrl?.trim();
        if (!apiKeyEnv || !configuredBaseUrl)
            return undefined;
        const baseUrl = normalizeImageGenerationBaseUrl(parsedSetting.baseUrl ?? configuredBaseUrl);
        if (!baseUrl)
            return undefined;
        return {
            model: match.id,
            baseUrl,
            apiKeyEnv,
        };
    }
    getImageGenerationConfig() {
        if (this.bareMode || this.safeMode)
            return undefined;
        return this.resolveImageGenerationModel(this.imageModel);
    }
    isImageGenerationEnabled() {
        return this.getImageGenerationConfig() !== undefined;
    }
    shouldAutoOpenArtifact() {
        if (process.env['QWEN_ARTIFACT_NO_AUTO_OPEN'] === '1')
            return false;
        return this.artifactAutoOpen && !this.isBrowserLaunchSuppressed();
    }
    isWorkflowsEnabled() {
        // Workflows are experimental and opt-in: enabled via settings or env var
        // P1 also honors a kill switch: QWEN_CODE_DISABLE_WORKFLOWS=1 forces off
        if (process.env['QWEN_CODE_DISABLE_WORKFLOWS'] === '1')
            return false;
        if (process.env['QWEN_CODE_ENABLE_WORKFLOWS'] === '1')
            return true;
        return this.workflowsEnabled;
    }
    setWorkflowsEnabled(enabled) {
        this.workflowsEnabled = enabled;
    }
    /**
     * P5 T7: read the `skipWorkflowUsageWarning` setting. When `true`, the
     * `Workflow` tool suppresses the one-time banner that announces the
     * `QWEN_CODE_MAX_TOKENS_PER_WORKFLOW` env knob. The registry-side
     * `shouldShowUsageWarning()` latch is still session-scoped, so even
     * when this returns `false` the banner fires at most once per
     * process.
     */
    getSkipWorkflowUsageWarning() {
        return this.skipWorkflowUsageWarning;
    }
    isComputerUseEnabled() {
        return this.computerUseEnabled;
    }
    /**
     * Configured screenshot longest-edge cap for Computer Use, or `undefined`
     * to leave cua-driver's built-in default (1568) in place. Resolved together
     * with the `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION` env override at the point
     * the driver connects (see `resolveMaxImageDimension`).
     */
    getComputerUseMaxImageDimension() {
        return this.computerUseMaxImageDimension;
    }
    getComputerUseIdleTimeoutMs() {
        return this.computerUseIdleTimeoutMs;
    }
    /**
     * Whether the turn loop should fire a fast-model call after each tool batch
     * to emit a `tool_use_summary` message. Mirrors Claude Code's
     * `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` gate, but defaults to on so the
     * compact-mode UI benefits without configuration.
     *
     * Env overrides (either direction): `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`
     * to force off, `=1` to force on.
     */
    getEmitToolUseSummaries() {
        const env = process.env['QWEN_CODE_EMIT_TOOL_USE_SUMMARIES'];
        if (env === '0' || env === 'false')
            return false;
        if (env === '1' || env === 'true')
            return true;
        return this.emitToolUseSummaries;
    }
    getEnableRecursiveFileSearch() {
        return this.fileFiltering.enableRecursiveFileSearch;
    }
    getFileFilteringEnableFuzzySearch() {
        return this.fileFiltering.enableFuzzySearch;
    }
    getFileFilteringRespectGitIgnore() {
        return this.fileFiltering.respectGitIgnore;
    }
    getFileFilteringRespectQwenIgnore() {
        return this.fileFiltering.respectQwenIgnore;
    }
    getFileFilteringOptions() {
        return {
            respectGitIgnore: this.fileFiltering.respectGitIgnore,
            respectQwenIgnore: this.fileFiltering.respectQwenIgnore,
            customIgnoreFiles: [...this.fileFiltering.customIgnoreFiles],
        };
    }
    /**
     * Gets custom file exclusion patterns from configuration.
     * TODO: This is a placeholder implementation. In the future, this could
     * read from settings files, CLI arguments, or environment variables.
     */
    getCustomExcludes() {
        // Placeholder implementation - returns empty array for now
        // Future implementation could read from:
        // - User settings file
        // - Project-specific configuration
        // - Environment variables
        // - CLI arguments
        return [];
    }
    getFileCheckpointingEnabled() {
        return this.fileCheckpointingEnabled;
    }
    enableFileCheckpointing() {
        this.fileCheckpointingEnabled = true;
        this.fileHistoryService = undefined;
    }
    getFileHistoryService() {
        if (!this.fileHistoryService) {
            const service = new FileHistoryService(this.sessionId, this.fileCheckpointingEnabled, this.cwd, (snapshot) => {
                if (this.fileHistoryService !== service)
                    return;
                this.getChatRecordingService()?.recordFileHistorySnapshot(snapshot);
            });
            this.fileHistoryService = service;
            const snapshots = this.sessionData?.fileHistorySnapshots;
            if (snapshots?.length && service.isEnabled()) {
                service.restoreFromSnapshots(snapshots);
                void service.validateRestoredSnapshots().catch((e) => {
                    this.debugLogger.error(`FileHistory: validateRestoredSnapshots failed: ${e}`);
                });
            }
        }
        return this.fileHistoryService;
    }
    getProxy() {
        return normalizeProxyUrl(this.proxy);
    }
    getWorkingDir() {
        return this.cwd;
    }
    getBugCommand() {
        return this.bugCommand;
    }
    getFileService() {
        if (!this.fileDiscoveryService) {
            this.fileDiscoveryService = new FileDiscoveryService(this.targetDir, this.fileFiltering.customIgnoreFiles);
        }
        return this.fileDiscoveryService;
    }
    getUsageStatisticsEnabled() {
        return this.usageStatisticsEnabled;
    }
    getExtensionContextFilePaths() {
        const extensionContextFilePaths = this.getActiveExtensions().flatMap((e) => e.contextFiles);
        return [
            ...extensionContextFilePaths,
            ...(this.outputLanguageFilePath ? [this.outputLanguageFilePath] : []),
        ];
    }
    getExperimentalZedIntegration() {
        return this.experimentalZedIntegration;
    }
    isSessionWriterLeaseEnabled() {
        return this.sessionWriterLeaseEnabled;
    }
    getListExtensions() {
        return this.listExtensions;
    }
    getExtensionManager() {
        return this.extensionManager;
    }
    /**
     * Get the hook system instance if hooks are enabled.
     * Returns undefined if hooks are not enabled.
     */
    getHookSystem() {
        return this.hookSystem;
    }
    /**
     * Fast-path check: returns true only when hooks are enabled AND there are
     * registered hooks for the given event name. Callers can use this to skip
     * expensive MessageBus round-trips when no hooks are configured.
     */
    hasHooksForEvent(eventName, sessionId) {
        return (this.hookSystem?.hasHooksForEvent(eventName, sessionId ?? this.getSessionId()) ?? false);
    }
    /**
     * Check if all hooks are disabled.
     */
    getDisableAllHooks() {
        return this.disableAllHooks || this.getBareMode() || this.isSafeMode();
    }
    getStopHookBlockingCap() {
        return this.stopHookBlockingCap;
    }
    getManagedAutoMemoryEnabled() {
        return (this.enableManagedAutoMemory && !this.getBareMode() && !this.isSafeMode());
    }
    /**
     * Whether the git-shared team memory tier is active. Opt-in: off unless the
     * `memory.enableTeamMemory` setting is on. `QWEN_CODE_MEMORY_TEAM` overrides
     * for tests / power users ('0' forces off, '1' forces on).
     */
    getTeamMemoryEnabled() {
        if (this.getBareMode()) {
            return false;
        }
        const override = process.env['QWEN_CODE_MEMORY_TEAM'];
        if (override === '0') {
            return false;
        }
        if (override === '1') {
            return true;
        }
        return this.enableTeamMemory;
    }
    /**
     * Whether the daemon/session should auto-sync team memory with the git
     * remote (pull + commit + push). Resolves the `memory.enableTeamMemorySync`
     * setting, with env `QWEN_CODE_MEMORY_TEAM_SYNC` ('0'/'1') as an override.
     * Off by default since it mutates the repo and pushes. Inert in bare mode.
     */
    getTeamMemorySyncEnabled() {
        if (this.getBareMode()) {
            return false;
        }
        const override = process.env['QWEN_CODE_MEMORY_TEAM_SYNC'];
        if (override === '0') {
            return false;
        }
        if (override === '1') {
            return true;
        }
        return this.enableTeamMemorySync;
    }
    isManagedMemoryAvailable() {
        return this.enableManagedAutoMemory && !this.getBareMode();
    }
    getManagedAutoDreamEnabled() {
        return (this.enableManagedAutoDream && !this.getBareMode() && !this.isSafeMode());
    }
    getAutoSkillEnabled() {
        return this.enableAutoSkill && !this.getBareMode() && !this.isSafeMode();
    }
    /**
     * Toggle auto-skill for the running session. The startup value is copied from
     * settings, so persisting a settings change alone would not take effect until
     * the next launch; the skill-review scheduler reads `getAutoSkillEnabled()`
     * live, so flipping this stops (or resumes) reviews immediately.
     *
     * @remarks `getAutoSkillEnabled()` additionally gates on bare/safe mode, so
     * it can still return false after `setAutoSkillEnabled(true)`.
     */
    setAutoSkillEnabled(enabled) {
        this.enableAutoSkill = enabled;
    }
    getAutoSkillConfirmEnabled() {
        return this.autoSkillConfirm && !this.getBareMode();
    }
    /**
     * Max runtime in minutes for background memory agents (extraction, dream,
     * remember, skill review). Resolves the `memory.agentTimeoutMinutes`
     * setting. Unset → each agent's built-in default; 0 → no time limit.
     */
    getMemoryAgentTimeoutMinutes() {
        return this.memoryAgentTimeoutMinutes;
    }
    /**
     * Max turns for background memory agents. Resolves the
     * `memory.agentMaxTurns` setting. Unset means each agent's built-in default;
     * 0 disables the turn limit.
     */
    getMemoryAgentMaxTurns() {
        return this.memoryAgentMaxTurns;
    }
    getPreventSystemSleepEnabled() {
        return this.preventSystemSleep && !this.isSafeMode();
    }
    /**
     * Return the MemoryManager instance created for this Config.
     * Use this to share background-task state (registry, drainer) with memory
     * module runtimes (extract, dream) instead of relying on module-level
     * globals.
     */
    getMemoryManager() {
        return this.memoryManager;
    }
    /**
     * Get the message bus instance.
     * Returns undefined if not set.
     */
    getMessageBus() {
        return this.messageBus;
    }
    /**
     * Set the message bus instance.
     * This is called by the CLI layer to inject the MessageBus.
     */
    setMessageBus(messageBus) {
        this.messageBus = messageBus;
    }
    /**
     * Get project-level hooks configuration.
     * Returns hooks from workspace settings, only in trusted folders.
     * Used by HookRegistry to load project-specific hooks with proper source attribution.
     */
    getProjectHooks() {
        if (this.getBareMode() || this.isSafeMode()) {
            return undefined;
        }
        // Only return project hooks if workspace is trusted
        if (!this.isTrustedFolder()) {
            return undefined;
        }
        // Prefer new projectHooks field, fall back to hooks for backward compatibility
        const hooks = this.projectHooks ?? this.hooks;
        return hooks;
    }
    /**
     * Get user-level hooks configuration.
     * Returns hooks from user settings, always available regardless of folder trust.
     * Used by HookRegistry to load user-specific hooks with proper source attribution.
     */
    getUserHooks() {
        if (this.getBareMode() || this.isSafeMode()) {
            return undefined;
        }
        // Prefer new userHooks field, fall back to hooks for backward compatibility
        const hooks = this.userHooks ?? this.hooks;
        return hooks;
    }
    getExtensions() {
        const extensions = this.extensionManager.getLoadedExtensions();
        if (this.overrideExtensions) {
            const overrideExtensionNames = new Set(this.overrideExtensions.map((name) => name.toLowerCase()));
            return extensions.filter((e) => overrideExtensionNames.has(e.name.toLowerCase()));
        }
        else {
            return extensions;
        }
    }
    getActiveExtensions() {
        return this.getExtensions().filter((e) => e.isActive);
    }
    getBlockedMcpServers() {
        const mcpServers = { ...(this.mcpServers || {}) };
        const extensions = this.getActiveExtensions();
        for (const extension of extensions) {
            Object.entries(extension.config.mcpServers || {}).forEach(([key, server]) => {
                if (mcpServers[key])
                    return;
                mcpServers[key] = {
                    ...server,
                    extensionName: extension.config.name,
                };
            });
        }
        const blockedMcpServers = [];
        if (this.allowedMcpServers) {
            Object.entries(mcpServers).forEach(([key, server]) => {
                const isAllowed = matchesAnyServerPattern(key, this.allowedMcpServers);
                if (!isAllowed) {
                    blockedMcpServers.push({
                        name: key,
                        extensionName: server.extensionName || '',
                    });
                }
            });
        }
        return blockedMcpServers;
    }
    getNoBrowser() {
        return this.noBrowser;
    }
    isBrowserLaunchSuppressed() {
        return this.getNoBrowser() || !shouldAttemptBrowserLaunch();
    }
    getIdeMode() {
        return this.ideMode;
    }
    getFolderTrustFeature() {
        return this.folderTrustFeature;
    }
    /**
     * Returns 'true' if the workspace is considered "trusted".
     * 'false' for untrusted.
     */
    getFolderTrust() {
        return this.folderTrust;
    }
    /**
     * Returns the whitelist of allowed HTTP hook URL patterns.
     * If empty, all URLs are allowed (subject to SSRF protection).
     */
    getAllowedHttpHookUrls() {
        return this.getBareMode() || this.isSafeMode()
            ? []
            : this.allowedHttpHookUrls;
    }
    /**
     * Returns whether HTTP hooks may target private/link-local IP ranges.
     * Only settable from trusted settings scopes (User/System/SystemDefaults).
     */
    getAllowPrivateNetworkHooks() {
        return this.getBareMode() || this.isSafeMode()
            ? false
            : this.allowPrivateNetworkHooks;
    }
    isTrustedFolder() {
        // isWorkspaceTrusted in cli/src/config/trustedFolder.js returns undefined
        // when the file based trust value is unavailable, since it is mainly used
        // in the initialization for trust dialogs, etc. Here we return true since
        // config.isTrustedFolder() is used for the main business logic of blocking
        // tool calls etc in the rest of the application.
        //
        // Default value is true since we load with trusted settings to avoid
        // restarts in the more common path. If the user chooses to mark the folder
        // as untrusted, the CLI will restart and we will have the trust value
        // reloaded.
        const context = ideContextStore.get();
        if (context?.workspaceState?.isTrusted !== undefined) {
            return context.workspaceState.isTrusted;
        }
        return this.trustedFolder ?? true;
    }
    setIdeMode(value) {
        this.ideMode = value;
    }
    getAuthType() {
        return this.getContentGeneratorConfig()?.authType;
    }
    getCliVersion() {
        return this.cliVersion;
    }
    getChannel() {
        return this.channel;
    }
    /**
     * Get the file descriptor for dual output JSON event stream.
     * When set, the TUI mode will also emit structured JSON events to this fd.
     */
    getJsonFd() {
        return this.jsonFd;
    }
    /**
     * Get the file path for dual output JSON event stream.
     * When set, the TUI mode will also emit structured JSON events to this file.
     */
    getJsonFile() {
        return this.jsonFile;
    }
    /**
     * Get the JSON Schema the model's final output must conform to.
     * When set, the non-interactive CLI registers a synthetic
     * `structured_output` tool and ends the session on a valid call.
     */
    getJsonSchema() {
        return this.jsonSchema;
    }
    /**
     * Get the file path for remote input commands (bidirectional sync).
     * When set, the TUI mode will watch this file for JSONL commands written
     * by an external process and submit them as user messages.
     */
    getInputFile() {
        return this.inputFile;
    }
    /**
     * Get the default file encoding for new files.
     * @returns FileEncodingType
     */
    getDefaultFileEncoding() {
        return this.defaultFileEncoding;
    }
    /**
     * Get the current FileSystemService
     */
    getFileSystemService() {
        return this.fileSystemService;
    }
    /**
     * Set a custom FileSystemService
     */
    setFileSystemService(fileSystemService) {
        this.fileSystemService = fileSystemService;
    }
    getChatCompression() {
        return this.chatCompression;
    }
    getAutoCompactThreshold() {
        const threshold = this.autoCompactThreshold;
        if (typeof threshold === 'number' && threshold > 0 && threshold <= 1) {
            return threshold;
        }
        return undefined;
    }
    isInteractive() {
        return this.interactive;
    }
    async getTerminalImageRenderSupport() {
        return this.terminalImageRenderSupportProvider
            ? this.terminalImageRenderSupportProvider()
            : {
                available: false,
                reason: 'No terminal image renderer is configured.',
            };
    }
    getUseRipgrep() {
        return this.useRipgrep;
    }
    getUseBuiltinRipgrep() {
        return this.useBuiltinRipgrep;
    }
    getShouldUseNodePtyShell() {
        return this.shouldUseNodePtyShell;
    }
    getSkipNextSpeakerCheck() {
        return this.skipNextSpeakerCheck;
    }
    getShellExecutionConfig() {
        return this.shellExecutionConfig;
    }
    setShellExecutionConfig(config) {
        this.shellExecutionConfig = {
            terminalWidth: config.terminalWidth ?? this.shellExecutionConfig.terminalWidth,
            terminalHeight: config.terminalHeight ?? this.shellExecutionConfig.terminalHeight,
            showColor: config.showColor ?? this.shellExecutionConfig.showColor,
            // pager: undefined is a valid explicit clear; ?? would preserve the old value.
            pager: Object.prototype.hasOwnProperty.call(config, 'pager')
                ? config.pager
                : this.shellExecutionConfig.pager,
            maxBufferedOutputBytes: config.maxBufferedOutputBytes ??
                this.shellExecutionConfig.maxBufferedOutputBytes,
        };
    }
    getScreenReader() {
        return this.accessibility.screenReader ?? false;
    }
    getSkipLoopDetection() {
        return this.skipLoopDetection;
    }
    /**
     * Effective per-turn tool-call cap. A configured value <= 0 disables the
     * cap and is returned as Infinity so callers can compare unconditionally
     * (mirrors getTruncateToolOutputThreshold).
     */
    getMaxToolCallsPerTurn() {
        if (this.maxToolCallsPerTurn <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        return this.maxToolCallsPerTurn;
    }
    /**
     * Whether maxToolCallsPerTurn was explicitly configured (vs. the resolved
     * default). An explicit value is treated as a hard cap (the released
     * contract); the default is treated adaptively (see
     * LoopDetectionService.checkTurnToolCallCap).
     */
    isMaxToolCallsPerTurnExplicit() {
        return this.maxToolCallsPerTurnExplicit;
    }
    getSkipStartupContext() {
        return this.skipStartupContext;
    }
    getBareMode() {
        return this.bareMode;
    }
    /**
     * Safe mode disables all user customizations (context files, hooks,
     * extensions, skills, MCP servers, rules) for troubleshooting.
     */
    isSafeMode() {
        return this.safeMode;
    }
    getTruncateToolOutputThreshold() {
        if (this.truncateToolOutputThreshold <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        return this.truncateToolOutputThreshold;
    }
    isTruncateToolOutputThresholdExplicit() {
        return this.truncateToolOutputThresholdExplicit;
    }
    getTruncateToolOutputLines() {
        if (this.truncateToolOutputLines <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        return this.truncateToolOutputLines;
    }
    /**
     * Configured default timeout (ms) for foreground shell commands, or
     * `undefined` when unset. The shell tool applies the precedence
     * per-call timeout > this setting > its built-in default, so returning
     * `undefined` here preserves the built-in fallback.
     */
    getShellDefaultTimeoutMs() {
        return this.shellDefaultTimeoutMs;
    }
    /**
     * Configured interval (ms) between silent-command heartbeats, or
     * `undefined` when unset (the shell tool falls back to its built-in
     * default). 0 disables heartbeats.
     */
    getShellHeartbeatIntervalMs() {
        return this.shellHeartbeatIntervalMs;
    }
    getToolOutputBatchBudget() {
        if (this.toolOutputBatchBudget <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        return this.toolOutputBatchBudget;
    }
    trackToolResultBytes(n) {
        this.toolResultBudget.bytesWritten += n;
    }
    getToolResultBytesWritten() {
        return this.toolResultBudget.bytesWritten;
    }
    getOutputFormat() {
        return this.outputFormat;
    }
    /**
     * Returns the chat recording service.
     */
    getChatRecordingService() {
        if (!this.chatRecordingEnabled) {
            return undefined;
        }
        if (!this.chatRecordingService) {
            this.chatRecordingService = this.createChatRecordingService();
        }
        return this.chatRecordingService;
    }
    getGoalRuntime() {
        if (!Object.hasOwn(this, 'goalRuntime') ||
            !this.chatRecordingEnabled ||
            !this.chatRecordingService ||
            !this.goalRuntime) {
            throw new GoalPersistenceUnavailableError();
        }
        return this.goalRuntime;
    }
    getGoalRuntimeReady() {
        const runtime = this.getGoalRuntime();
        if (!Object.hasOwn(this, 'goalRuntimeReady') || !this.goalRuntimeReady) {
            return Promise.reject(new GoalPersistenceUnavailableError());
        }
        return this.goalRuntimeReady.then(() => runtime);
    }
    getGoalRuntimePrepared() {
        const runtime = this.getGoalRuntime();
        if (!this.sessionRestoreRuntime)
            return this.getGoalRuntimeReady();
        return runtime.getPreparedRestore().then(() => runtime);
    }
    async rebaseGoalRuntimeFromActiveTranscript() {
        const runtime = this.getGoalRuntime();
        const recordingService = this.chatRecordingService;
        if (!recordingService) {
            throw new GoalPersistenceUnavailableError();
        }
        const records = await recordingService.readActiveTranscriptChain();
        this.goalTurnHostUnbind?.();
        this.goalTurnHostUnbind = undefined;
        runtime.dispose();
        this.initializeGoalRuntime(records);
        await this.goalRuntimeReady;
    }
    bindGoalTurnHost(host) {
        if (!Object.hasOwn(this, 'goalRuntime')) {
            throw new GoalPersistenceUnavailableError();
        }
        const generation = this.goalTurnHostGeneration + 1;
        this.goalTurnHostGeneration = generation;
        this.goalTurnHostUnbind?.();
        this.goalTurnHost = host;
        this.goalTurnHostUnbind = this.goalRuntime?.bindHost(host);
        return () => {
            if (this.goalTurnHostGeneration !== generation ||
                this.goalTurnHost !== host) {
                return;
            }
            this.goalTurnHostUnbind?.();
            this.goalTurnHostUnbind = undefined;
            this.goalTurnHost = undefined;
        };
    }
    onChatRecordingFailure(listener) {
        this.chatRecordingFailureListeners.add(listener);
        return () => {
            this.chatRecordingFailureListeners.delete(listener);
        };
    }
    createChatRecordingService() {
        return new ChatRecordingService(this, (event) => {
            this.notifyChatRecordingFailure(event);
        }, this.sessionWriterLeaseEnabled, this.sessionRestoreRuntime?.recording);
    }
    initializeGoalRuntime(records, restoreRuntime) {
        this.rejectGoalRestoreActivation?.(new GoalPersistenceUnavailableError('Goal runtime replaced'));
        this.goalRestoreActivation = undefined;
        this.rejectGoalRestoreActivation = undefined;
        this.goalTurnHostUnbind?.();
        this.goalTurnHostUnbind = undefined;
        // A runtime built here supersedes any restore still waiting on the
        // writer: its records belong to the outgoing session.
        this.settlePendingGoalRestore(new GoalPersistenceUnavailableError('Goal runtime was replaced before the session writer became available'));
        if (!this.chatRecordingService) {
            this.goalRuntime = undefined;
            this.goalRuntimeReady = undefined;
            return;
        }
        const recorder = this.chatRecordingService;
        const runtime = createGoalRuntime({
            journal: recorder,
            evidenceSource: recorder,
            verifier: createGoalVerifier(this),
            checkpointVerifier: createGoalCheckpointVerifier(this),
        });
        this.goalRuntime = runtime;
        if (this.goalTurnHost) {
            this.goalTurnHostUnbind = runtime.bindHost(this.goalTurnHost);
        }
        // Under a session-writer lease the recorder starts `inactive` and
        // rejects every write until `activateChatRecording()` hands it the
        // lease. Restoring now would push the legacy-migration journal write
        // straight into that guard, and `restore()` latches the resulting
        // failure as `recoveryError` for the life of the runtime — the
        // migrated goal is dropped and goal persistence is bricked for the
        // whole resumed session. Wait for the writer instead.
        if (restoreRuntime) {
            const preparation = runtime.prepareRestore(records ?? [], restoreRuntime.goalCheckpointWindow);
            let resolveActivation;
            let rejectActivation;
            const activation = new Promise((resolve, reject) => {
                resolveActivation = resolve;
                rejectActivation = reject;
            });
            this.rejectGoalRestoreActivation = rejectActivation;
            this.goalRestoreActivation = () => {
                const started = runtime.activateRestoredWork();
                void started.then(resolveActivation, rejectActivation);
                return started;
            };
            this.goalRuntimeReady = Promise.all([preparation, activation]).then(() => runtime);
        }
        else if (this.sessionWriterLeaseEnabled &&
            !recorder.hasWriteOwnership()) {
            const ready = new Promise((resolve, reject) => {
                this.pendingGoalRestore = { runtime, resolve, reject };
            });
            this.goalRuntimeReady = ready;
        }
        else {
            this.goalRuntimeReady = runtime
                .restore(records ?? [])
                .then(() => runtime);
        }
        void this.goalRuntimeReady.catch(() => undefined);
    }
    /**
     * Run the restore that {@link initializeGoalRuntime} deferred because the
     * session writer was not yet accepting writes.
     *
     * Called once `activateChatRecording()` has handed the recorder its lease.
     * Deliberately re-reads the records from `sessionData`: activation
     * replaces it with the authoritative transcript loaded under the lease, so
     * the deferred restore sees newer records than the constructor did.
     */
    startPendingGoalRestore() {
        const pending = this.pendingGoalRestore;
        if (!pending)
            return;
        this.pendingGoalRestore = undefined;
        if (pending.runtime !== this.goalRuntime) {
            pending.reject(new GoalPersistenceUnavailableError('Goal runtime was replaced before the session writer became available'));
            return;
        }
        void pending.runtime
            .restore(this.sessionData?.conversation.messages ?? [])
            .then(() => pending.resolve(pending.runtime), (error) => pending.reject(error));
    }
    /**
     * Fail a deferred restore that can never run — the writer never became
     * available, or the runtime it belonged to was replaced. Without this the
     * promise behind {@link getGoalRuntimeReady} would stay pending forever
     * and every awaiting caller would hang rather than see the failure.
     */
    settlePendingGoalRestore(error) {
        const pending = this.pendingGoalRestore;
        if (!pending)
            return;
        this.pendingGoalRestore = undefined;
        pending.reject(error);
    }
    setSessionRestoreProjection(projection) {
        this.pendingSessionRestoreProjection = projection;
        this.sessionRestoreRuntime = projection?.runtime;
        this.restoredFileHistory = false;
    }
    clearSessionRestoreProjection() {
        this.pendingSessionRestoreProjection = undefined;
        this.sessionRestoreRuntime = undefined;
        this.restoredFileHistory = false;
        this.rejectGoalRestoreActivation?.(new GoalPersistenceUnavailableError('Session restore was abandoned'));
        this.goalRestoreActivation = undefined;
        this.rejectGoalRestoreActivation = undefined;
    }
    notifyChatRecordingFailure(event) {
        for (const listener of [...this.chatRecordingFailureListeners]) {
            try {
                const notification = listener(event);
                if (notification) {
                    void notification.catch((error) => {
                        this.debugLogger.debug('Chat recording failure listener rejected:', error);
                    });
                }
            }
            catch (error) {
                this.debugLogger.debug('Chat recording failure listener threw:', error);
            }
        }
    }
    /**
     * Returns the transcript file path for the current session.
     * This is the path to the JSONL file where the conversation is recorded.
     * Returns empty string if chat recording is disabled.
     */
    getTranscriptPath() {
        if (!this.chatRecordingEnabled) {
            return '';
        }
        const projectDir = this.storage.getProjectDir();
        const sessionId = this.getSessionId();
        const safeFilename = `${sessionId}.jsonl`;
        return path.join(projectDir, 'chats', safeFilename);
    }
    async assertCanStartTurn() {
        if (this.chatRecordingService?.hasWriteOwnership()) {
            await this.chatRecordingService.assertCanStartTurn();
        }
    }
    hasSessionWriteOwnership() {
        return (this.pendingSessionWriterLease !== undefined ||
            this.chatRecordingService?.hasWriteOwnership() === true);
    }
    setSessionWriterReclaimPolicy(policy) {
        if (this.initialized) {
            throw new SessionWriterUnavailableError();
        }
        this.sessionWriterReclaimPolicy = policy;
    }
    setSessionWriterTakeoverPolicy(policy) {
        if (this.initialized) {
            throw new SessionWriterUnavailableError();
        }
        this.sessionWriterTakeoverPolicy = policy;
    }
    closeSessionWriter(options) {
        if (options?.handoff && this.sessionWriterTakeoverPolicy === 'certified') {
            this.sessionWriterHandoffRequested = true;
        }
        this.sessionWriterShutdownRequested = true;
        this.chatRecordingService?.beginClose({
            handoff: this.sessionWriterHandoffRequested,
        });
        this.startPendingSessionWriterRelease();
        this.sessionWriterClosePromise ??= this.closeSessionWriterOnce();
        return this.sessionWriterClosePromise;
    }
    async closeSessionWriterOnce() {
        const failures = [];
        const activation = this.sessionWriterActivationPromise;
        try {
            await activation;
        }
        catch (error) {
            if (!(error instanceof SessionWriterShutdownError)) {
                failures.push(error);
            }
        }
        try {
            await this.chatRecordingService?.close({
                handoff: this.sessionWriterHandoffRequested,
            });
        }
        catch (error) {
            failures.push(error);
        }
        const pendingLease = activation
            ? undefined
            : this.pendingSessionWriterLease;
        if (pendingLease) {
            try {
                await this.startPendingSessionWriterRelease(pendingLease);
                if (this.pendingSessionWriterLease === pendingLease &&
                    pendingLease.isReleased) {
                    this.pendingSessionWriterLease = undefined;
                }
            }
            catch (error) {
                if (error instanceof SessionWriterLostError ||
                    pendingLease.isReleased) {
                    this.pendingSessionWriterLease = undefined;
                }
                failures.push(error);
            }
        }
        if (failures.length === 1) {
            throw failures[0];
        }
        if (failures.length > 1) {
            throw new AggregateError(failures, 'Session writer shutdown failed');
        }
    }
    startPendingSessionWriterRelease(lease = this.pendingSessionWriterLease) {
        if (!lease)
            return undefined;
        const existing = this.pendingSessionWriterRelease;
        if (existing?.lease === lease)
            return existing.promise;
        const promise = lease.release();
        this.pendingSessionWriterRelease = { lease, promise };
        void promise.catch(() => undefined);
        return promise;
    }
    getSessionRuntimeBaseDir() {
        return this.sessionRuntimeBaseDir;
    }
    /**
     * Gets or creates a SessionService for managing chat sessions.
     */
    getSessionService() {
        if (!this.sessionService) {
            this.sessionService = new SessionService(this.storage.getProjectRoot(), {
                runtimeBaseDir: this.sessionRuntimeBaseDir,
            });
        }
        return this.sessionService;
    }
    getFileExclusions() {
        return this.fileExclusions;
    }
    getSubagentManager() {
        return this.subagentManager;
    }
    getBackgroundTaskRegistry() {
        return this.backgroundTaskRegistry;
    }
    getMonitorRegistry() {
        return this.monitorRegistry;
    }
    getBackgroundAgentResumeService() {
        if (!this.backgroundAgentResumeService) {
            this.backgroundAgentResumeService = new BackgroundAgentResumeService(this);
        }
        return this.backgroundAgentResumeService;
    }
    async loadPausedBackgroundAgents(sessionId = this.getSessionId()) {
        if (sessionId !== this.getSessionId()) {
            this.debugLogger.warn(`Refusing to restore background agents for non-current session ${sessionId}.`);
            return [];
        }
        const service = this.getBackgroundAgentResumeService();
        let recovered;
        try {
            recovered = await service.loadPausedBackgroundAgents(sessionId);
        }
        catch (error) {
            this.debugLogger.warn(`Background agent restore failed for session ${sessionId}; continuing without restored agents.`, error);
            return [];
        }
        if (recovered.length > 0 && !this.getBareMode()) {
            this.pendingRecoveredAgentsNotice =
                service.buildRecoveredBackgroundAgentsModelNotice(recovered.length);
        }
        return recovered;
    }
    consumePendingRecoveredAgentsNotice() {
        const notice = this.pendingRecoveredAgentsNotice;
        this.pendingRecoveredAgentsNotice = null;
        return notice;
    }
    async resumeBackgroundAgent(agentId, initialMessage) {
        return this.getBackgroundAgentResumeService().resumeBackgroundAgent(agentId, initialMessage);
    }
    async reviveCompletedBackgroundAgent(agentId, initialMessage) {
        return this.getBackgroundAgentResumeService().reviveCompletedBackgroundAgent(agentId, initialMessage);
    }
    abandonBackgroundAgent(agentId) {
        return this.getBackgroundAgentResumeService().abandonBackgroundAgent(agentId);
    }
    getBackgroundShellRegistry() {
        return this.backgroundShellRegistry;
    }
    getWorkflowRunRegistry() {
        return this.workflowRunRegistry;
    }
    /**
     * Session-scoped cache that tracks Read / Edit / WriteFile operations
     * on files. The cache must be **per-Config-instance** so that each
     * subagent (which gets its own Config) does not inherit the parent's
     * recorded reads via the prototype chain.
     *
     * The wrinkle: every subagent / scoped-agent / fork path in this
     * codebase constructs its Config via `Object.create(parent)`. That
     * does **not** run instance field initializers, so the parent's
     * `fileReadCache` field is reachable on the child only by prototype
     * lookup — i.e. child and parent end up sharing the same cache. The
     * own-property check below detects "this instance was made by
     * Object.create" and lazily attaches a fresh cache, ensuring
     * isolation without requiring every Object.create site to remember
     * to override the field.
     */
    getFileReadCache() {
        if (!Object.prototype.hasOwnProperty.call(this, 'fileReadCache')) {
            // The own-property write needs to bypass `private`'s structural
            // check — the field is conceptually still private to the class,
            // we just need TS to let us install an own copy on a child
            // instance produced by `Object.create(parent)`.
            this.fileReadCache =
                new FileReadCache();
        }
        return this.fileReadCache;
    }
    /**
     * When true, ReadFile / Edit / WriteFile must bypass the session
     * FileReadCache entirely and behave as if it did not exist (no
     * `file_unchanged` placeholder, no future prior-read enforcement).
     * Intended as an escape hatch for sessions where the cache's "model
     * has already seen this content earlier in the conversation"
     * assumption is unreliable — e.g. after context compaction or
     * transcript transformation.
     */
    getFileReadCacheDisabled() {
        return this.fileReadCacheDisabled;
    }
    /**
     * Whether interactive permission prompts should be auto-denied.
     * True for background agents that have no UI to show prompts.
     * PermissionRequest hooks still run and can override the denial.
     */
    getShouldAvoidPermissionPrompts() {
        return false;
    }
    getSkillManager() {
        return this.skillManager;
    }
    /**
     * Registers a provider that returns model-invocable commands (e.g., bundled
     * skills, user/project file commands, MCP prompts). Called by the CLI's
     * CommandService after initialisation so that the startup snapshot and
     * per-turn drain can include these in the `<available_skills>` listing.
     */
    setModelInvocableCommandsProvider(provider) {
        this.modelInvocableCommandsProvider = provider;
    }
    /**
     * Returns the registered model-invocable commands provider, or null if none
     * has been registered (e.g., in SDK mode).
     */
    getModelInvocableCommandsProvider() {
        return this.modelInvocableCommandsProvider;
    }
    /**
     * Registers an executor that can invoke a model-invocable command by name
     * (e.g., MCP prompts). Returns the prompt content as a string, or null if
     * the command cannot be found or executed. Called by the CLI layer.
     */
    setModelInvocableCommandsExecutor(executor) {
        this.modelInvocableCommandsExecutor = executor;
    }
    /**
     * Returns the registered model-invocable commands executor, or null if none
     * has been registered (e.g., in SDK mode).
     */
    getModelInvocableCommandsExecutor() {
        return this.modelInvocableCommandsExecutor;
    }
    /**
     * Records skill keys that were announced inline on a tool result by
     * `coreToolScheduler` (e.g. path-activated conditional skills). The
     * client's `drainSkillAndCommandReminders` consumes these to mark them as
     * announced and avoid a duplicate announcement in the same turn's tail
     * reminder. Keys use the `"skill:<name>"` format matching
     * `GeminiClient.skillEntryKey`.
     */
    addInlineAnnouncedSkillKeys(keys) {
        for (const k of keys) {
            this.pendingInlineAnnouncedSkillKeys.add(k);
        }
    }
    /**
     * Returns and clears the set of skill keys announced inline since the last
     * consumption. Idempotent — a second call returns an empty set until new
     * keys are added.
     */
    consumeInlineAnnouncedSkillKeys() {
        const result = this.pendingInlineAnnouncedSkillKeys;
        this.pendingInlineAnnouncedSkillKeys = new Set();
        return result;
    }
    getPermissionManager() {
        return this.permissionManager;
    }
    getToolInvocationGuard() {
        return this.toolInvocationGuard;
    }
    /**
     * Returns the callback for persisting permission rules to settings files.
     * Returns undefined if no callback was provided (e.g. SDK mode).
     */
    getOnPersistPermissionRule() {
        return this.onPersistPermissionRuleCallback;
    }
    async registerImageGenerationTool(registry) {
        if (!this.isImageGenerationEnabled() ||
            registry.getAllToolNames().includes(ToolNames.IMAGE_GEN)) {
            return;
        }
        let enabled = true;
        try {
            enabled = this.permissionManager
                ? await this.permissionManager.isToolEnabled(ToolNames.IMAGE_GEN)
                : true;
        }
        catch (error) {
            this.debugLogger.warn(`Failed to check permissions for tool "${ToolNames.IMAGE_GEN}", skipping registration:`, error);
            return;
        }
        if (!enabled)
            return;
        registry.registerFactory(ToolNames.IMAGE_GEN, async () => {
            const { ImageGenTool } = await import('../tools/image-gen.js');
            return new ImageGenTool(this);
        });
    }
    async createToolRegistry(sendSdkMcpMessage, options) {
        const registry = new ToolRegistry(this, this.eventEmitter, sendSdkMcpMessage);
        // Helper: check permission then register a lazy factory (no module import
        // happens here — the dynamic import() only runs when the tool is first used).
        const registerLazy = async (toolName, factory) => {
            // PermissionManager handles both the coreTools allowlist (registry-level)
            // and deny rules (runtime-level) in a single check.
            let pmEnabled = true;
            try {
                pmEnabled = this.permissionManager
                    ? await this.permissionManager.isToolEnabled(toolName)
                    : true; // Should never reach here after initialize(), but safe default.
            }
            catch (error) {
                this.debugLogger.warn(`Failed to check permissions for tool "${toolName}", skipping registration:`, error);
                return;
            }
            if (pmEnabled) {
                registry.registerFactory(toolName, factory);
            }
        };
        // The synthetic structured_output tool is the terminal contract for
        // --json-schema runs. It must be registered in BOTH the bare-mode
        // branch and the regular branch — without it the model can't finish
        // a structured run, so omitting either branch causes
        // `qwen [--bare] --json-schema X -p "..."` to loop until
        // maxSessionTurns and exit via the "plain text" failure path. Hoisted
        // out of the two branches so the dynamic-import factory shape stays
        // in sync between them.
        //
        // Skipped when building a subagent-context registry. `this.jsonSchema`
        // propagates to subagent overrides via prototype delegation
        // (`Object.create(base)` in `createApprovalModeOverride` /
        // `buildSubagentContextOverride`), but only `runNonInteractive`'s main
        // and drain loops detect a successful structured_output call as
        // terminal. A subagent that called the tool would receive the
        // "Session will end now" llmContent, then keep running because its
        // own loop has no termination handler — wasted tokens with no
        // structured payload surfacing on stdout. Strip the registration in
        // those contexts.
        const registerStructuredOutputIfRequested = async () => {
            if (!this.jsonSchema)
                return;
            if (options?.forSubAgent)
                return;
            const schema = this.jsonSchema;
            await registerLazy(ToolNames.STRUCTURED_OUTPUT, async () => {
                const { SyntheticOutputTool } = await import('../tools/syntheticOutput.js');
                return new SyntheticOutputTool(schema);
            });
        };
        const registerGoalWorkerTools = async () => {
            if (options?.forSubAgent)
                return;
            await registerLazy(ToolNames.GET_GOAL, async () => {
                const { GetGoalTool } = await import('../goals/goal-tools.js');
                return new GetGoalTool(this);
            });
            await registerLazy(ToolNames.UPDATE_GOAL, async () => {
                const { UpdateGoalTool } = await import('../goals/goal-tools.js');
                return new UpdateGoalTool(this);
            });
        };
        if (this.getBareMode()) {
            await registerLazy(ToolNames.READ_FILE, async () => {
                const { ReadFileTool } = await import('../tools/read-file.js');
                return new ReadFileTool(this);
            });
            await registerLazy(ToolNames.EDIT, async () => {
                const { EditTool } = await import('../tools/edit.js');
                return new EditTool(this);
            });
            await registerLazy(ToolNames.NOTEBOOK_EDIT, async () => {
                const { NotebookEditTool } = await import('../tools/notebook-edit.js');
                return new NotebookEditTool(this);
            });
            await registerLazy(ToolNames.SHELL, async () => {
                const { ShellTool } = await import('../tools/shell.js');
                return new ShellTool(this);
            });
            await registerGoalWorkerTools();
            await registerStructuredOutputIfRequested();
            this.debugLogger.debug(`ToolRegistry created: ${JSON.stringify(registry.getAllToolNames())} (${registry.getAllToolNames().length} tools)`);
            return registry;
        }
        // --- Core tools (always registered) ---
        await registerGoalWorkerTools();
        await registerLazy(ToolNames.TOOL_SEARCH, async () => {
            const { ToolSearchTool } = await import('../tools/tool-search.js');
            return new ToolSearchTool(this);
        });
        await registerLazy(ToolNames.READ_MCP_RESOURCE, async () => {
            const { ReadMcpResourceTool } = await import('../tools/read-mcp-resource.js');
            return new ReadMcpResourceTool(this);
        });
        await registerLazy(ToolNames.AGENT, async () => {
            const { AgentTool } = await import('../tools/agent/agent.js');
            return new AgentTool(this);
        });
        await registerLazy(ToolNames.LIST_AGENTS, async () => {
            const { ListAgentsTool } = await import('../tools/list-agents.js');
            return new ListAgentsTool(this);
        });
        await registerLazy(ToolNames.TASK_STOP, async () => {
            const { TaskStopTool } = await import('../tools/task-stop.js');
            return new TaskStopTool(this);
        });
        await registerLazy(ToolNames.SEND_MESSAGE, async () => {
            const { SendMessageTool } = await import('../tools/send-message.js');
            return new SendMessageTool(this);
        });
        await registerLazy(ToolNames.SKILL, async () => {
            const { SkillTool } = await import('../tools/skill.js');
            return new SkillTool(this);
        });
        // list_directory is opt-in (disabled by default): glob covers directory
        // listing in most cases, so the tool only registers when explicitly
        // enabled via `tools.listDirectory.enabled` or the coreTools allowlist.
        if (this.isLsToolEnabled()) {
            await registerLazy(ToolNames.LS, async () => {
                const { LSTool } = await import('../tools/ls.js');
                return new LSTool(this);
            });
        }
        await registerLazy(ToolNames.READ_FILE, async () => {
            const { ReadFileTool } = await import('../tools/read-file.js');
            return new ReadFileTool(this);
        });
        await registerLazy(ToolNames.ZOOM_IMAGE, async () => {
            const { ZoomImageTool } = await import('../tools/zoom-image.js');
            return new ZoomImageTool(this);
        });
        // --- Grep / RipGrep (conditional) ---
        if (this.getUseRipgrep()) {
            let useRipgrep = false;
            let errorString = undefined;
            recordStartupEvent('config_initialize_ripgrep_probe_start');
            try {
                useRipgrep = await canUseRipgrep(this.getUseBuiltinRipgrep());
            }
            catch (error) {
                errorString = getErrorMessage(error);
            }
            recordStartupEvent('config_initialize_ripgrep_probe_end');
            if (useRipgrep) {
                await registerLazy(ToolNames.GREP, async () => {
                    const { RipGrepTool } = await import('../tools/ripGrep.js');
                    return new RipGrepTool(this);
                });
            }
            else {
                logRipgrepFallback(this, new RipgrepFallbackEvent(this.getUseRipgrep(), this.getUseBuiltinRipgrep(), errorString || 'ripgrep is not available'));
                await registerLazy(ToolNames.GREP, async () => {
                    const { GrepTool } = await import('../tools/grep.js');
                    return new GrepTool(this);
                });
            }
        }
        else {
            recordStartupEvent('config_initialize_ripgrep_probe_start');
            recordStartupEvent('config_initialize_ripgrep_probe_end');
            await registerLazy(ToolNames.GREP, async () => {
                const { GrepTool } = await import('../tools/grep.js');
                return new GrepTool(this);
            });
        }
        await registerLazy(ToolNames.GLOB, async () => {
            const { GlobTool } = await import('../tools/glob.js');
            return new GlobTool(this);
        });
        await registerLazy(ToolNames.EDIT, async () => {
            const { EditTool } = await import('../tools/edit.js');
            return new EditTool(this);
        });
        await registerLazy(ToolNames.NOTEBOOK_EDIT, async () => {
            const { NotebookEditTool } = await import('../tools/notebook-edit.js');
            return new NotebookEditTool(this);
        });
        await registerLazy(ToolNames.WRITE_FILE, async () => {
            const { WriteFileTool } = await import('../tools/write-file.js');
            return new WriteFileTool(this);
        });
        await registerLazy(ToolNames.SHELL, async () => {
            const { ShellTool } = await import('../tools/shell.js');
            return new ShellTool(this);
        });
        await registerLazy(ToolNames.TODO_WRITE, async () => {
            const { TodoWriteTool } = await import('../tools/todoWrite.js');
            return new TodoWriteTool(this);
        });
        const supportsUserInteraction = resolveInteractionMode(this) !== 'headless';
        if (supportsUserInteraction) {
            await registerLazy(ToolNames.ASK_USER_QUESTION, async () => {
                const { AskUserQuestionTool } = await import('../tools/askUserQuestion.js');
                return new AskUserQuestionTool(this);
            });
        }
        if (!this.sdkMode && (supportsUserInteraction || options?.forSubAgent)) {
            await registerLazy(ToolNames.EXIT_PLAN_MODE, async () => {
                const { ExitPlanModeTool } = await import('../tools/exitPlanMode.js');
                return new ExitPlanModeTool(this);
            });
        }
        if (!this.sdkMode && supportsUserInteraction) {
            await registerLazy(ToolNames.ENTER_PLAN_MODE, async () => {
                const { EnterPlanModeTool } = await import('../tools/enterPlanMode.js');
                return new EnterPlanModeTool(this);
            });
        }
        await registerLazy(ToolNames.ENTER_WORKTREE, async () => {
            const { EnterWorktreeTool } = await import('../tools/enter-worktree.js');
            return new EnterWorktreeTool(this);
        });
        await registerLazy(ToolNames.EXIT_WORKTREE, async () => {
            const { ExitWorktreeTool } = await import('../tools/exit-worktree.js');
            return new ExitWorktreeTool(this);
        });
        await registerLazy(ToolNames.WEB_FETCH, async () => {
            const { WebFetchTool } = await import('../tools/web-fetch.js');
            return new WebFetchTool(this);
        });
        if (resolveInteractionMode(this) === 'interactive' &&
            !this.sdkMode &&
            !this.getScreenReader() &&
            !options?.forSubAgent) {
            await registerLazy(ToolNames.DISPLAY_IMAGE, async () => {
                const { DisplayImageTool } = await import('../tools/display-image.js');
                return new DisplayImageTool(this);
            });
        }
        // WebSearch is opt-in: it registers only when explicitly enabled AND the
        // configured search model resolves to a usable DashScope entry. A failed
        // gate surfaces a one-time startup notice instead of a silently missing
        // tool. Nothing is imported unless the feature is enabled.
        if (this.webSearchSettings?.enabled) {
            const { evaluateWebSearchGate } = await import('../tools/web-search.js');
            const gate = evaluateWebSearchGate(this);
            if (gate.ok) {
                await registerLazy(ToolNames.WEB_SEARCH, async () => {
                    const { WebSearchTool } = await import('../tools/web-search.js');
                    return new WebSearchTool(this);
                });
            }
            else if (!this.webSearchNoticeEmitted && !options?.forSubAgent) {
                this.webSearchNoticeEmitted = true;
                this.warnings.push(gate.notice);
            }
        }
        await this.registerImageGenerationTool(registry);
        if (this.isArtifactEnabled()) {
            await registerLazy(ToolNames.ARTIFACT, async () => {
                const { ArtifactTool } = await import('../tools/artifact/artifact-tool.js');
                return new ArtifactTool(this);
            });
        }
        if (this.isRecordArtifactEnabled()) {
            await registerLazy(ToolNames.RECORD_ARTIFACT, async () => {
                const { RecordArtifactTool } = await import('../tools/record-artifact.js');
                return new RecordArtifactTool(this);
            });
        }
        if (this.isLspEnabled() && this.getLspClient()) {
            await registerLazy(ToolNames.LSP, async () => {
                const { LspTool } = await import('../tools/lsp.js');
                return new LspTool(this);
            });
        }
        // Register synthetic structured-output tool when --json-schema is set.
        // The tool's parameter schema IS the user-supplied JSON Schema, so the
        // model's arguments must match it (Ajv-validated in BaseDeclarativeTool).
        // Same helper as the bare-mode branch above to keep the registration
        // shape and permission gating in sync between the two paths.
        await registerStructuredOutputIfRequested();
        // Register cron tools unless disabled
        if (this.isCronEnabled()) {
            await registerLazy(ToolNames.CRON_CREATE, async () => {
                const { CronCreateTool } = await import('../tools/cron-create.js');
                return new CronCreateTool(this);
            });
            await registerLazy(ToolNames.CRON_LIST, async () => {
                const { CronListTool } = await import('../tools/cron-list.js');
                return new CronListTool(this);
            });
            await registerLazy(ToolNames.CRON_DELETE, async () => {
                const { CronDeleteTool } = await import('../tools/cron-delete.js');
                return new CronDeleteTool(this);
            });
            // Reuses the cron scheduler's session-only one-shot path, so it is
            // gated on the same flag as the cron tools.
            await registerLazy(ToolNames.LOOP_WAKEUP, async () => {
                const { LoopWakeupTool } = await import('../tools/loop-wakeup.js');
                return new LoopWakeupTool(this);
            });
        }
        // create_sub_session: spawn a fresh top-level sub-session and run a prompt
        // in it. Only functional under `qwen serve` (needs the bridge, wired as a
        // spawner by the ACP session); the tool's execute() reports a clear
        // daemon-only error otherwise. Registered unconditionally so the message is
        // available rather than the tool silently missing.
        await registerLazy(ToolNames.CREATE_SUB_SESSION, async () => {
            const { CreateSubSessionTool } = await import('../tools/create-sub-session.js');
            return new CreateSubSessionTool(this);
        });
        // Register team collaboration tools (experimental). The team-specific
        // tools (team_create/team_delete/task_create/task_update/task_list)
        // are gated on this flag.
        if (this.isAgentTeamEnabled()) {
            await registerLazy(ToolNames.TEAM_CREATE, async () => {
                const { TeamCreateTool } = await import('../tools/team-create.js');
                return new TeamCreateTool(this);
            });
            await registerLazy(ToolNames.TEAM_DELETE, async () => {
                const { TeamDeleteTool } = await import('../tools/team-delete.js');
                return new TeamDeleteTool(this);
            });
            await registerLazy(ToolNames.TEAM_PLAN_APPROVAL, async () => {
                const { TeamPlanApprovalTool } = await import('../tools/team-plan-approval.js');
                return new TeamPlanApprovalTool(this);
            });
            await registerLazy(ToolNames.TASK_CREATE, async () => {
                const { TaskCreateTool } = await import('../tools/task-create.js');
                return new TaskCreateTool(this);
            });
            await registerLazy(ToolNames.TASK_UPDATE, async () => {
                const { TaskUpdateTool } = await import('../tools/task-update.js');
                return new TaskUpdateTool(this);
            });
            await registerLazy(ToolNames.TASK_LIST, async () => {
                const { TaskListTool } = await import('../tools/task-list.js');
                return new TaskListTool(this);
            });
        }
        // Register workflow tool when enabled
        if (this.isWorkflowsEnabled()) {
            await registerLazy(ToolNames.WORKFLOW, async () => {
                const { WorkflowTool } = await import('../tools/workflow/workflow.js');
                return new WorkflowTool(this);
            });
        }
        // Register computer-use tools unless disabled. All 9 are deferred —
        // they surface only via ToolSearch keyword match
        // (see packages/core/src/tools/computer-use/).
        //
        // Pass `registerLazy` (not the bare `registry`) so the same
        // PermissionManager.isToolEnabled() check that gates every other
        // built-in also gates these. Direct registry.registerFactory() would
        // bypass coreTools allowlist + whole-tool deny rules.
        if (this.isComputerUseEnabled()) {
            const { registerComputerUseTools } = await import('../tools/computer-use/index.js');
            await registerComputerUseTools(registerLazy, this);
        }
        // Register monitor tool
        await registerLazy(ToolNames.MONITOR, async () => {
            const { MonitorTool } = await import('../tools/monitor.js');
            return new MonitorTool(this);
        });
        // apply any pending MCP
        // budget-event callback BEFORE `discoverAllTools` (legacy blocking
        // mode runs MCP discovery synchronously in there) and BEFORE the
        // post-`createToolRegistry` `startMcpDiscoveryInBackground` (default
        // mode). Either way the manager has its callback wired at the
        // moment the first discovery pass fires, so end-of-pass events
        // for that pass are routed through the SDK push channel.
        if (this.pendingMcpBudgetCallback) {
            const mgr = registry.getMcpClientManager();
            if (mgr && typeof mgr.setOnBudgetEvent === 'function') {
                mgr.setOnBudgetEvent(this.pendingMcpBudgetCallback);
            }
            // clear after consumption so a
            // subsequent `createToolRegistry` call (e.g. subagent override
            // via `createApprovalModeOverride` /
            // `buildSubagentContextOverride`) doesn't re-apply the parent
            // session's callback to a fresh manager. Subagent contexts run
            // their own MCP clients but should NOT push budget events
            // through the parent's ACP session — that would route subagent
            // telemetry to the wrong subscriber.
            //
            // Late-call setter (`setMcpBudgetEventCallback` after
            // `initialize()`) is unaffected: it dispatches directly to the
            // existing manager via the `if (this.toolRegistry)` branch,
            // not through `pendingMcpBudgetCallback`.
            this.pendingMcpBudgetCallback = undefined;
        }
        if (!options?.skipDiscovery) {
            await registry.discoverAllTools();
        }
        this.debugLogger.debug(`ToolRegistry created: ${JSON.stringify(registry.getAllToolNames())} (${registry.getAllToolNames().length} tools)`);
        return registry;
    }
    /**
     * register the MCP guardrail
     * push-event callback. Acceptable to call at any point in the
     * Config lifecycle — before, during, or after `initialize()`.
     *
     * Two paths:
     * - **Pre-init** (no `toolRegistry` yet): stash on
     *   `pendingMcpBudgetCallback`. `createToolRegistry` will apply it
     *   to the freshly-constructed manager and clear the stash (round
     *   6 fix). The stash is the ONLY way to reach a manager that
     *   doesn't exist yet.
     * - **Late** (`toolRegistry` already exists): dispatch directly to
     *   the existing manager. **DO NOT** also stash — that's the
     *   round-7 fix. Pre-fix, both paths assigned to
     *   `pendingMcpBudgetCallback` regardless, so a subsequent
     *   `createToolRegistry` (subagent override via
     *   `createApprovalModeOverride` /
     *   `buildSubagentContextOverride`) would re-apply the parent
     *   session's callback to the subagent's fresh manager — routing
     *   subagent telemetry through the wrong ACP session.
     *
     * `cb: undefined` clears the registration. `off`-mode managers
     * silently drop the callback (their state machine never runs).
     */
    setMcpBudgetEventCallback(cb) {
        if (this.toolRegistry) {
            // Late-call path: apply directly. Do NOT stash — see comment
            // above for the subagent isolation rationale.
            const mgr = this.toolRegistry.getMcpClientManager?.();
            if (mgr && typeof mgr.setOnBudgetEvent === 'function') {
                mgr.setOnBudgetEvent(cb);
            }
            this.pendingMcpBudgetCallback = undefined;
            return;
        }
        // Pre-init path: stash for `createToolRegistry` to consume.
        this.pendingMcpBudgetCallback = cb;
    }
    subSessionSpawner;
    /**
     * Wire the sub-session spawner used by the `create_sub_session` tool. Set by
     * the daemon/ACP session layer (which routes it to the bridge over
     * `extMethod`); left unset in interactive TUI / headless — the tool then
     * reports itself as daemon-only. `undefined` clears it on session teardown.
     */
    setSubSessionSpawner(spawner) {
        this.subSessionSpawner = spawner;
    }
    /** The injected sub-session spawner, or undefined outside daemon mode. */
    getSubSessionSpawner() {
        return this.subSessionSpawner;
    }
}
//# sourceMappingURL=config.js.map