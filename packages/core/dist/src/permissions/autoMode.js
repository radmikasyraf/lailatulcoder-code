/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUTO approval mode three-layer filter.
 *
 * Layer 1 (L5.1): acceptEdits fast-path — Edit/Write targeting a path inside
 *   the workspace are auto-allowed without invoking the classifier.
 * Layer 2 (L5.2): safe-tool allowlist — built-in read-only / metadata tools
 *   are auto-allowed without invoking the classifier.
 * Layer 3 (L5.3): LLM classifier — see `classifier.ts` (wired in by the
 *   top-level `evaluateAutoMode` orchestrator).
 *
 * All three layers only fire when L4 PermissionManager returned `'default'`
 * (no rule matched). When L4 returns `'ask'` (user wrote an explicit ask
 * rule) the fast-paths are skipped — user intent takes precedence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApprovalMode } from '../config/config.js';
import { getAllGeminiMdFilenames, LOCAL_CONTEXT_FILENAME, } from '../memory/const.js';
import { ToolNames } from '../tools/tool-names.js';
import { normalizeMonitorCommand } from '../utils/shell-utils.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { classifyAction } from './classifier.js';
import { extractShellOperationsAcrossCommand } from './shell-semantics.js';
import { recordAllow, recordBlock, recordUnavailable, } from './denialTracking.js';
import { isDestructiveCommand, extractLastUserPrompt, } from './destructive-commands.js';
const autoModeDebugLogger = createDebugLogger('AUTO_MODE');
const RAW_PROTECTED_WRITE_COMMANDS = /\b(?:cp|mv|install|rsync|patch|perl|sed|tee|dd|sort|awk|gawk|node|python3?|ruby|php|curl|wget|tar|unzip|cpio)\b/;
/**
 * Built-in tools whose any-parameter behavior is safe under the AUTO mode
 * classifier's threat model — they never write files, never perform network
 * calls, and never execute arbitrary code.
 *
 * MCP tools are intentionally excluded (third-party code, cannot be statically
 * trusted regardless of name).
 */
export const SAFE_TOOL_ALLOWLIST = new Set([
    // Read-only file / search
    ToolNames.READ_FILE,
    ToolNames.ZOOM_IMAGE,
    ToolNames.GREP,
    ToolNames.GLOB,
    ToolNames.LS,
    ToolNames.LSP,
    // Tool introspection
    ToolNames.TOOL_SEARCH,
    // Output / session metadata
    ToolNames.TODO_WRITE,
    ToolNames.STRUCTURED_OUTPUT,
    // Inverse tools — hand control back to the user
    ToolNames.ASK_USER_QUESTION,
    ToolNames.EXIT_PLAN_MODE,
    ToolNames.ENTER_PLAN_MODE,
    // Background task coordination (peers' permission checks still apply)
    ToolNames.CRON_LIST,
    ToolNames.TASK_STOP,
    // `send_message` is intentionally NOT in the allowlist: it injects
    // arbitrary text into another running agent as a new instruction. The
    // classifier MUST see the destination + message content so it can
    // judge whether the inter-agent message is steering a peer toward
    // destructive or exfiltrating actions.
]);
/**
 * Returns true when `toolName` is a built-in tool whose every legal parameter
 * combination is safe enough to skip the classifier. Caller should only
 * consult this when L4 evaluation returned `'default'` — explicit user rules
 * still take precedence.
 */
export function isInSafeToolAllowlist(toolName) {
    return SAFE_TOOL_ALLOWLIST.has(toolName);
}
/** Edit / Write tool names eligible for the acceptEdits fast-path. */
const EDIT_TOOL_NAMES = new Set([
    ToolNames.EDIT,
    ToolNames.WRITE_FILE,
]);
const PROTECTED_WRITE_TOOL_NAMES = new Set([
    ToolNames.EDIT,
    ToolNames.WRITE_FILE,
    ToolNames.NOTEBOOK_EDIT,
]);
const SHELL_LIKE_TOOL_NAMES = new Set([
    ToolNames.SHELL,
    ToolNames.MONITOR,
]);
/**
 * Predicate for whether the AUTO mode L5 branch should run for a given call.
 * Centralizes the rule "only when the session is in AUTO and the tool isn't
 * one that always needs direct user attention". Used by both the CLI
 * scheduler and the ACP Session path so they stay in sync.
 */
export function shouldRunAutoModeForCall(approvalMode, toolName) {
    if (approvalMode !== ApprovalMode.AUTO)
        return false;
    if (toolName === ToolNames.ASK_USER_QUESTION)
        return false;
    if (toolName === ToolNames.EXIT_PLAN_MODE)
        return false;
    if (toolName === ToolNames.ENTER_PLAN_MODE)
        return false;
    return true;
}
/**
 * Workspace paths that can affect later execution and must not take the
 * acceptEdits fast-path. Specific edits can still pass through the AUTO
 * classifier or an explicit `permissions.allow` rule.
 */
const PERSISTENCE_PATH_PATTERNS = Object.freeze([
    /(^|\/)\.git(?:\/|$)/, // git config, hooks, alias, and worktree .git files
    /(^|\/)\.husky\//, // git hooks via husky
    /(^|\/)package\.json$/, // npm scripts (root + nested workspaces)
    /(^|\/)\.npmrc$/, // registry override → malicious package fetch on next install
    /(^|\/)(makefile|gnumakefile)$/, // make targets
    /(^|\/)\.?justfile$/, // just task runner
    /(^|\/)taskfile\.ya?ml$/, // go-task
    /(^|\/)\.github\/workflows\//, // CI workflow definitions
]);
const SELF_MODIFICATION_PATH_PATTERNS = Object.freeze([
    /(^|\/)\.lailatulcoder\/settings(?:\.[^/]*)?\.json$/,
    /(^|\/)(qwen|agents)\.md$/,
    /(^|\/)\.lailatulcoder\/qwen\.local\.md$/,
    /(^|\/)\.lailatulcoder\/rules(?:\/|$)/,
    /(^|\/)\.lailatulcoder\/commands(?:\/|$)/,
    /(^|\/)\.lailatulcoder\/agents(?:\/|$)/,
    /(^|\/)\.lailatulcoder\/skills(?:\/|$)/,
    /(^|\/)\.lailatulcoder\/hooks(?:\/|$)/,
    /(^|\/)\.lailatulcoder\/fork-profiles(?:\/|$)/,
    /(^|\/)\.mcp\.json$/,
]);
function normalizePathForAutoModePattern(filePath) {
    return filePath.replace(/\\/g, '/').toLowerCase();
}
function trimPathSlashes(filePath) {
    let start = 0;
    let end = filePath.length;
    while (start < end && filePath[start] === '/')
        start++;
    while (end > start && filePath[end - 1] === '/')
        end--;
    return filePath.slice(start, end);
}
function matchesConfiguredContextFile(normalizedPath) {
    return [...getAllGeminiMdFilenames(), LOCAL_CONTEXT_FILENAME].some((filename) => {
        const normalizedFilename = trimPathSlashes(normalizePathForAutoModePattern(filename));
        if (!normalizedFilename)
            return false;
        return (normalizedPath === normalizedFilename ||
            normalizedPath.endsWith(`/${normalizedFilename}`));
    });
}
let qwenHomePrefixesCacheKey;
let qwenHomePrefixesCache;
function getNormalizedQwenHomePrefixes() {
    const qwenHome = process.env['QWEN_HOME'];
    if (!qwenHome)
        return [];
    if (qwenHomePrefixesCacheKey === qwenHome &&
        qwenHomePrefixesCache !== undefined) {
        return qwenHomePrefixesCache;
    }
    const candidates = new Set([path.resolve(qwenHome)]);
    if (qwenHome.startsWith('/') || /^[A-Za-z]:[\\/]/.test(qwenHome)) {
        candidates.add(qwenHome);
    }
    try {
        candidates.add(fs.realpathSync.native(qwenHome));
    }
    catch {
        // QWEN_HOME may not exist yet; the configured path still matters.
    }
    const prefixes = [...candidates].map((candidate) => normalizePathForAutoModePattern(candidate).replace(/\/+$/, ''));
    qwenHomePrefixesCacheKey = qwenHome;
    qwenHomePrefixesCache = prefixes;
    return prefixes;
}
function matchesQwenHomeSurface(normalizedPath) {
    for (const normalizedQwenHome of getNormalizedQwenHomePrefixes()) {
        const qwenHomePrefix = `${normalizedQwenHome}/`;
        if (!normalizedPath.startsWith(qwenHomePrefix))
            continue;
        const relativePath = normalizedPath.slice(qwenHomePrefix.length);
        if (/^settings(?:\.[^/]*)?\.json$/.test(relativePath) ||
            /^qwen\.local\.md$/.test(relativePath) ||
            /^\.mcp\.json$/.test(relativePath) ||
            /^(rules|commands|agents|skills|hooks|fork-profiles)(?:\/|$)/.test(relativePath)) {
            return true;
        }
    }
    return false;
}
function getAutoModeWritePathCandidates(filePath) {
    const candidates = new Set([filePath]);
    try {
        candidates.add(fs.realpathSync.native(filePath));
    }
    catch {
        const parentDir = path.dirname(filePath);
        try {
            candidates.add(path.join(fs.realpathSync.native(parentDir), path.basename(filePath)));
        }
        catch {
            // Best-effort only: new files often do not exist yet, and the raw path
            // still catches direct protected-path writes.
        }
    }
    return [...candidates];
}
export function isAutoModeProtectedWritePath(filePath) {
    return getAutoModeWritePathCandidates(filePath).some((candidate) => {
        const normalized = normalizePathForAutoModePattern(candidate);
        return (matchesConfiguredContextFile(normalized) ||
            matchesQwenHomeSurface(normalized) ||
            PERSISTENCE_PATH_PATTERNS.some((pattern) => pattern.test(normalized)) ||
            SELF_MODIFICATION_PATH_PATTERNS.some((pattern) => pattern.test(normalized)));
    });
}
/**
 * Returns true when `classifyAllShell` is enabled and the tool is a
 * shell-like tool (Bash/Monitor). Used to force all shell commands
 * through the classifier even when their default permission is 'allow'.
 */
export function shouldClassifyAllShellForAutoMode(toolName, config) {
    if (!SHELL_LIKE_TOOL_NAMES.has(toolName))
        return false;
    return config.getAutoModeSettings()?.classifyAllShell === true;
}
/**
 * Returns true when an L4 `allow` verdict must still pass through the AUTO
 * classifier because it writes protected configuration or instruction paths.
 */
export function shouldForceAutoModeReviewForAllow(ctx, cwdFallback = process.cwd()) {
    if (PROTECTED_WRITE_TOOL_NAMES.has(ctx.toolName) &&
        ctx.filePath &&
        isAutoModeProtectedWritePath(ctx.filePath)) {
        return true;
    }
    if (!SHELL_LIKE_TOOL_NAMES.has(ctx.toolName) || !ctx.command)
        return false;
    // Monitor wraps the user command; analyze the same payload used by
    // PermissionManager.
    const command = ctx.toolName === ToolNames.MONITOR
        ? normalizeMonitorCommand(ctx.command).safetyCommand
        : ctx.command;
    const cwd = ctx.cwd ?? cwdFallback;
    if (hasRawProtectedRedirect(command, cwd))
        return true;
    if (hasRawProtectedWriteCommand(command, cwd))
        return true;
    return extractShellOperationsAcrossCommand(command, cwd).some((op) => {
        if (op.virtualTool !== ToolNames.EDIT &&
            op.virtualTool !== ToolNames.WRITE_FILE) {
            return false;
        }
        if (op.cwdUnknown && op.pathMayDependOnCwd) {
            return true;
        }
        return Boolean(op.filePath && isAutoModeProtectedWritePath(op.filePath));
    });
}
function hasRawProtectedRedirect(command, cwd) {
    for (let i = 0; i < command.length; i++) {
        if (command[i] !== '>')
            continue;
        while (command[i] === '>' || command[i] === '|' || command[i] === '&') {
            i++;
        }
        while (command[i] === ' ' || command[i] === '\t')
            i++;
        let token = '';
        while (i < command.length) {
            const ch = command[i];
            if (/\s|[;&|]/.test(ch))
                break;
            token += ch;
            i++;
        }
        const target = stripRawRedirectTargetToken(token);
        if (!target || target.startsWith('&'))
            continue;
        const resolved = path.isAbsolute(target) ? target : path.join(cwd, target);
        if (isAutoModeProtectedWritePath(resolved))
            return true;
    }
    return false;
}
function hasRawProtectedWriteCommand(command, cwd) {
    for (const line of command.split('\n')) {
        if (!RAW_PROTECTED_WRITE_COMMANDS.test(line))
            continue;
        if (/\b(?:sed|perl)\b/.test(line) &&
            !/(?:^|\s)(?:-[A-Za-z]*i|--in-place(?:=|\s|$))/.test(line)) {
            continue;
        }
        for (const rawToken of line.split(/\s+/)) {
            const target = stripRawRedirectTargetToken(rawToken).replace(/^[({]+|[),;]+$/g, '');
            for (const candidate of rawProtectedWriteTargets(target, line)) {
                if (/\$[{(A-Za-z_]/.test(candidate))
                    return true;
                if (containsProtectedPathFragment(candidate, cwd))
                    return true;
            }
        }
    }
    return false;
}
function rawProtectedWriteTargets(token, line) {
    if (!token)
        return [];
    const flagValue = rawFlagValue(token, line);
    if (flagValue)
        return [flagValue];
    return token.startsWith('-') ? [] : [token];
}
function rawFlagValue(token, line) {
    const equalsIndex = token.indexOf('=');
    if (token.startsWith('--directory=') &&
        /\btar\b/.test(line) &&
        equalsIndex > 2) {
        return token.slice(equalsIndex + 1);
    }
    if (token.startsWith('--output=') &&
        /\bpatch\b/.test(line) &&
        equalsIndex > 2) {
        return token.slice(equalsIndex + 1);
    }
    for (const { flag, command } of [
        { flag: '-C', command: /\btar\b/ },
        { flag: '-d', command: /\bunzip\b/ },
        { flag: '-D', command: /\bcpio\b/ },
        { flag: '-o', command: /\b(?:curl|sort|patch)\b/ },
        { flag: '-O', command: /\bwget\b/ },
        { flag: '-t', command: /\b(?:cp|mv|install|ln)\b/ },
    ]) {
        if (command.test(line) && token.startsWith(flag) && token.length > 2) {
            return token.slice(flag.length).replace(/^=/, '');
        }
    }
    return undefined;
}
function containsProtectedPathFragment(token, cwd) {
    for (const candidate of token.match(/[A-Za-z0-9_./~-]+/g) ?? []) {
        const resolved = path.isAbsolute(candidate)
            ? candidate
            : path.join(cwd, candidate);
        if (isAutoModeProtectedWritePath(resolved))
            return true;
    }
    return false;
}
function stripRawRedirectTargetToken(token) {
    let start = 0;
    let end = token.length;
    while (start < end &&
        (token[start] === "'" || token[start] === '"' || token[start] === '$')) {
        if (token[start] === '$' && token[start + 1] !== "'")
            break;
        start++;
    }
    while (end > start) {
        const ch = token[end - 1];
        if (ch !== "'" && ch !== '"' && ch !== ')' && ch !== '}' && ch !== '&') {
            break;
        }
        end--;
    }
    return token.slice(start, end);
}
/**
 * Returns true when the pending action is a file edit / write targeting a
 * path that lies within the current workspace (cwd + additional directories)
 * AND is not rejected by {@link isAutoModeProtectedWritePath} (covers
 * persistence paths and Qwen self-modification surfaces, including symlinks
 * whose realpath resolves to a protected target).
 *
 * Symlinks ARE resolved via `WorkspaceContext.isPathWithinWorkspace`, which
 * internally calls `fs.realpathSync`. A symlink whose target is outside the
 * workspace correctly fails this check and falls through to the classifier
 * — fail-safe by implementation.
 *
 * Caller should only consult this when L4 evaluation returned `'default'`.
 */
export function passesAcceptEditsFastPath(ctx, config) {
    if (!EDIT_TOOL_NAMES.has(ctx.toolName))
        return false;
    if (!ctx.filePath)
        return false;
    // Persistence paths (hooks, package.json scripts, CI definitions) and
    // Qwen self-modification surfaces (.lailatulcoder/settings*.json, configured context
    // files, .lailatulcoder/rules|commands|agents|skills|hooks/, .mcp.json) must never
    // auto-approve via fast-path — the former execute code on subsequent tooling
    // operations, the latter let an agent rewrite its own permissions or
    // instructions.
    if (isAutoModeProtectedWritePath(ctx.filePath)) {
        return false;
    }
    return config.getWorkspaceContext().isPathWithinWorkspace(ctx.filePath);
}
/**
 * Apply an AUTO decision and denial-tracking update. Shared by the scheduler
 * and ACP paths; callers still handle their integration-specific responses.
 */
export function applyAutoModeDecision(decision, config, denialState) {
    switch (decision.via) {
        case 'fast-path:accept-edits':
        case 'fast-path:allowlist':
            config.setAutoModeDenialState(recordAllow(denialState));
            return { kind: 'approved' };
        case 'blocked:destructive-command':
            config.setAutoModeDenialState(recordBlock(denialState));
            return {
                kind: 'blocked',
                errorMessage: `${decision.reason}\n${AUTO_MODE_DENIAL_GUIDANCE}`,
                reason: 'classifier_blocked',
            };
        case 'classifier':
            if (decision.shouldBlock) {
                if (decision.unavailable) {
                    config.setAutoModeDenialState(recordUnavailable(denialState));
                    return {
                        kind: 'fallback',
                        reason: 'classifier_unavailable',
                        message: formatClassifierUnavailableFallbackMessage(decision),
                    };
                }
                config.setAutoModeDenialState(recordBlock(denialState));
                return {
                    kind: 'blocked',
                    errorMessage: formatClassifierBlockMessage(decision),
                    reason: 'classifier_blocked',
                };
            }
            config.setAutoModeDenialState(recordAllow(denialState));
            return { kind: 'approved' };
        case 'fallback':
            return { kind: 'fallback', reason: decision.reason };
        default: {
            const _exhaustive = decision;
            // Make unexpected JS/interop values visible at runtime.
            autoModeDebugLogger.error(`Auto mode: unrecognised decision.via "${decision.via}" — falling through to manual approval`);
            void _exhaustive;
            return { kind: 'fallback', reason: 'safety_check' };
        }
    }
}
export function shouldFirePermissionDeniedForAutoMode(decision, outcome) {
    // The type predicate narrows callers to classifier decisions so reason
    // mapping can safely read classifier-only fields such as `unavailable`.
    return (decision.via === 'classifier' &&
        decision.shouldBlock &&
        outcome.kind === 'blocked');
}
export function getAutoModePermissionDeniedReason(decision) {
    return decision.unavailable ? 'classifier_unavailable' : 'classifier_blocked';
}
/**
 * Trailing guidance appended to classifier policy-denial tool results.
 * Centralised so the policy boundary (no silent retries, no equivalent-path
 * workarounds, stop and ask the user) stays in sync with the main system
 * prompt's Denied Tool Calls rule.
 */
export const AUTO_MODE_DENIAL_GUIDANCE = 'Do not try to complete the denied action through another tool, shell indirection, generated script, alias, symlink, config change, hook, command file, MCP configuration, encoded payload, or equivalent path. If that action is required, stop and ask the user for explicit approval. You may continue with unrelated safe work or a genuinely safer alternative that does not accomplish the denied action.';
export function formatClassifierUnavailableFallbackMessage(decision) {
    const detail = decision.reason ? ` (${decision.reason})` : '';
    return `Auto Mode couldn't classify this action${detail}. Review it manually. Switching to Default Mode is recommended if you want to continue without the classifier.`;
}
export function decorateClassifierUnavailableConfirmation(confirmation, message) {
    return {
        ...confirmation,
        ...(confirmation.type === 'ask_user_question'
            ? {}
            : { hideAlwaysAllow: true }),
        autoModeFallback: {
            reason: 'classifier_unavailable',
            message,
        },
    };
}
/**
 * Build the tool-error message the scheduler / ACP session returns when the
 * classifier supplies a policy block. Keeping it here gives both paths the
 * same denial guidance.
 *
 * Callers are responsible for only invoking this on classifier verdicts —
 * `decision.via === 'classifier'` with `decision.shouldBlock === true`.
 */
export function formatClassifierBlockMessage(decision) {
    return `Blocked by auto mode policy: ${decision.reason}\n${AUTO_MODE_DENIAL_GUIDANCE}`;
}
/**
 * Resolve a pending tool call under AUTO mode by walking the three-layer
 * filter in order. Caller must have already determined that L4 did not
 * resolve the call to `allow` or `deny` — `evaluateAutoMode` only runs
 * when L4 produced `'ask'` (tool's intrinsic default OR user-forced) or
 * `'default'`.
 */
export async function evaluateAutoMode(input) {
    // L5.1: edits within the workspace skip the classifier. We only short-
    // circuit when the user has NOT explicitly forced an ask rule; an
    // intrinsic L3 'ask' (e.g. EditTool's default) does not block the
    // fast-path, otherwise the fast-path would be dead code for the very
    // tools it's designed to cover.
    if (!input.pmForcedAsk &&
        passesAcceptEditsFastPath(input.ctx, input.config)) {
        return { via: 'fast-path:accept-edits' };
    }
    // L5.2: hardcoded safe-tool allowlist. Same gate as L5.1.
    if (!input.pmForcedAsk && isInSafeToolAllowlist(input.ctx.toolName)) {
        return { via: 'fast-path:allowlist' };
    }
    // L5.2.5: deterministic destructive command guard.
    // Regex-based hard blocks that run BEFORE the LLM classifier, so API
    // failures or classifier misjudgment cannot allow destructive git/IaC
    // commands through. Only applies to shell-like tools.
    if (SHELL_LIKE_TOOL_NAMES.has(input.ctx.toolName) && input.ctx.command) {
        const command = input.ctx.toolName === ToolNames.MONITOR
            ? normalizeMonitorCommand(input.ctx.command).safetyCommand
            : input.ctx.command;
        const userPrompt = extractLastUserPrompt(input.messages) ?? '';
        const destructiveResult = isDestructiveCommand(command, userPrompt, input.ctx.cwd);
        if (destructiveResult?.blocked) {
            return {
                via: 'blocked:destructive-command',
                reason: destructiveResult.reason,
            };
        }
    }
    // User `ask` rules require manual confirmation.
    if (input.pmForcedAsk) {
        return { via: 'fallback', reason: 'ask_rule' };
    }
    // Caller (scheduler) has detected an armed fallback state; surface that
    // so the call drops to manual approval instead of burning a classifier
    // request that would deepen the denial streak.
    if (input.skipClassifierReason) {
        return { via: 'fallback', reason: input.skipClassifierReason };
    }
    // L5.3: two-stage LLM classifier.
    // Forward the messages array by reference — buildClassifierContents only
    // reads it. The previous spread `[...input.messages]` was a redundant
    // allocation on every classifier call.
    const result = await classifyAction({
        toolName: input.ctx.toolName,
        toolParams: input.toolParams,
        messages: input.messages,
        config: input.config,
        signal: input.signal,
    });
    return {
        via: 'classifier',
        shouldBlock: result.shouldBlock,
        reason: result.reason,
        unavailable: result.unavailable === true,
        stage: result.stage,
        durationMs: result.durationMs,
    };
}
//# sourceMappingURL=autoMode.js.map