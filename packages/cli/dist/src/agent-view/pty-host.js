/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { StringDecoder } from 'node:string_decoder';
import { PTY_HOST_AUTH_TOKEN_ENV } from './pty-host-env.js';
import { AGENT_VIEW_WORKER_ENV_KEYS } from './worker-sideband.js';
export const DEFAULT_AGENT_VIEW_PTY_OUTPUT_BYTES = 1024 * 1024;
const INTERNAL_ONLY_WORKER_ENV_KEYS = new Set([
    PTY_HOST_AUTH_TOKEN_ENV,
    'TMUX',
    'TMUX_PANE',
    'STY',
    'WINDOW',
    'WINDOWID',
    'TERMCAP',
    'COLUMNS',
    'LINES',
]);
export class AgentViewPtyUnavailableError extends Error {
    constructor() {
        super('Agent View PTY is unavailable in this runtime.');
        this.name = 'AgentViewPtyUnavailableError';
    }
}
export class AgentViewLaunchConfigError extends Error {
    errors;
    constructor(errors) {
        super(`Invalid Agent View launch config: ${errors.join('; ')}`);
        this.errors = errors;
        this.name = 'AgentViewLaunchConfigError';
    }
}
export class BoundedOutputRing {
    maxBytes;
    static MAX_CHUNK_BYTES = 8192;
    chunks = [];
    retainedBytesValue = 0;
    totalBytesValue = 0;
    constructor(maxBytes = DEFAULT_AGENT_VIEW_PTY_OUTPUT_BYTES) {
        this.maxBytes = maxBytes;
        if (!Number.isInteger(maxBytes) || maxBytes < 1) {
            throw new RangeError('maxBytes must be a positive integer');
        }
    }
    get retainedBytes() {
        return this.retainedBytesValue;
    }
    get totalBytes() {
        return this.totalBytesValue;
    }
    get droppedBytes() {
        return this.totalBytesValue - this.retainedBytesValue;
    }
    append(data) {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        this.totalBytesValue += chunk.byteLength;
        if (chunk.byteLength >= this.maxBytes) {
            // Copy instead of retaining a subarray view: a view would pin the
            // entire backing ArrayBuffer of the (potentially huge) source chunk.
            const retained = trimUtf8Start(Buffer.from(chunk.subarray(chunk.byteLength - this.maxBytes)));
            this.chunks = [retained];
            this.retainedBytesValue = retained.byteLength;
            return;
        }
        this.appendChunk(chunk);
        this.retainedBytesValue += chunk.byteLength;
        this.trim();
    }
    toBuffer() {
        return Buffer.concat(this.chunks, this.retainedBytesValue);
    }
    toString(encoding = 'utf8') {
        return this.toBuffer().toString(encoding);
    }
    trim() {
        let trimmed = false;
        while (this.retainedBytesValue > this.maxBytes) {
            trimmed = true;
            const excess = this.retainedBytesValue - this.maxBytes;
            const first = this.chunks[0];
            if (!first) {
                this.retainedBytesValue = 0;
                return;
            }
            if (first.byteLength <= excess) {
                this.chunks.shift();
                this.retainedBytesValue -= first.byteLength;
            }
            else {
                const retained = trimUtf8Start(first.subarray(excess));
                if (retained.byteLength === 0) {
                    this.chunks.shift();
                }
                else {
                    this.chunks[0] = retained;
                }
                this.retainedBytesValue -= first.byteLength - retained.byteLength;
            }
        }
        // Only a size trim can leave continuation bytes at the window start;
        // without one, dropping them would discard data with room still free.
        if (trimmed)
            this.trimLeadingUtf8ContinuationBytes();
    }
    appendChunk(chunk) {
        const previous = this.chunks[this.chunks.length - 1];
        if (previous &&
            previous.byteLength + chunk.byteLength <=
                BoundedOutputRing.MAX_CHUNK_BYTES) {
            this.chunks[this.chunks.length - 1] = Buffer.concat([previous, chunk]);
            return;
        }
        this.chunks.push(chunk);
    }
    trimLeadingUtf8ContinuationBytes() {
        while (this.chunks.length > 0) {
            const first = this.chunks[0];
            const retained = trimUtf8Start(first);
            if (retained.byteLength === first.byteLength) {
                return;
            }
            if (retained.byteLength === 0) {
                this.chunks.shift();
            }
            else {
                this.chunks[0] = retained;
            }
            this.retainedBytesValue -= first.byteLength - retained.byteLength;
            if (retained.byteLength > 0)
                return;
        }
    }
}
function trimUtf8Start(buffer) {
    let offset = 0;
    while (offset < buffer.byteLength &&
        isUtf8ContinuationByte(buffer[offset])) {
        offset++;
    }
    return offset === 0 ? buffer : buffer.subarray(offset);
}
function isUtf8ContinuationByte(value) {
    return value >= 0x80 && value <= 0xbf;
}
export async function checkAgentViewPtyAvailability(loadPty = loadAgentViewPty) {
    const pty = await loadPty();
    if (!pty) {
        return { available: false, reason: 'missing' };
    }
    return { available: true, implementationName: pty.name };
}
export async function loadAgentViewPty() {
    if ('bun' in process.versions) {
        return null;
    }
    const lydell = await importPty('@lydell/node-pty', 'lydell-node-pty');
    if (lydell) {
        return lydell;
    }
    return importPty('node-pty', 'node-pty');
}
export function validateAgentViewLaunchConfig(value) {
    const errors = [];
    if (!isRecord(value)) {
        return { ok: false, errors: ['launch config must be an object'] };
    }
    requireLiteral(value, 'schemaVersion', 1, errors);
    requireNonEmptyString(value, 'sessionId', errors);
    requireStringArray(value, 'argv', errors, { nonEmpty: true });
    requireStringRecord(value, 'env', errors);
    requireNonEmptyString(value, 'entrypoint', errors);
    requireNonEmptyString(value, 'projectCwd', errors);
    requireNonEmptyString(value, 'activeCwd', errors);
    requireStringArray(value, 'includeDirectories', errors);
    validateOptionalString(value, 'model', errors);
    validateOptionalString(value, 'approvalMode', errors);
    validateOptionalString(value, 'sandbox', errors);
    validateOptionalString(value, 'settingsDigest', errors);
    validateOptionalString(value, 'mcpDigest', errors);
    validateTerminal(value['terminal'], errors);
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true, launch: value };
}
export async function launchAgentViewPtyHost(rawLaunch, options = {}) {
    const validation = validateAgentViewLaunchConfig(rawLaunch);
    if (!validation.ok) {
        throw new AgentViewLaunchConfigError(validation.errors);
    }
    const pty = options.pty === undefined
        ? await (options.loadPty ?? loadAgentViewPty)()
        : options.pty;
    if (!pty) {
        throw new AgentViewPtyUnavailableError();
    }
    const launch = validation.launch;
    const command = options.fakeCommand ?? launch.argv;
    validateCommand(command);
    const output = new BoundedOutputRing(options.maxOutputBytes ?? DEFAULT_AGENT_VIEW_PTY_OUTPUT_BYTES);
    // Strip the outer session's sideband identity from the inherited env so a
    // nested host cannot leak its token/endpoint into the inner worker; the
    // launch env intentionally carries the inner worker's own sideband keys.
    const inheritedEnv = stringProcessEnv(process.env);
    for (const key of AGENT_VIEW_WORKER_ENV_KEYS) {
        delete inheritedEnv[key];
    }
    const workerEnv = {
        ...inheritedEnv,
        ...launch.env,
        TERM: 'xterm-256color',
    };
    for (const key of INTERNAL_ONLY_WORKER_ENV_KEYS) {
        delete workerEnv[key];
    }
    const ptyProcess = pty.module.spawn(command[0], command.slice(1), {
        cwd: launch.activeCwd,
        name: 'xterm-256color',
        cols: launch.terminal.columns,
        rows: launch.terminal.rows,
        env: workerEnv,
        handleFlowControl: false,
    });
    let inputDecoder = new StringDecoder('utf8');
    const disposables = [];
    let settled = false;
    let resolveExit = () => { };
    const resolveExitOnce = (exit) => {
        if (settled)
            return;
        settled = true;
        resolveExit(exit);
    };
    const dataDisposable = ptyProcess.onData((data) => {
        output.append(data);
    });
    if (dataDisposable) {
        disposables.push(dataDisposable);
    }
    const exited = new Promise((resolve) => {
        resolveExit = resolve;
        const exitDisposable = ptyProcess.onExit((event) => {
            resolveExitOnce(event);
        });
        if (exitDisposable) {
            disposables.push(exitDisposable);
        }
    });
    return {
        pid: process.pid,
        workerPid: ptyProcess.pid,
        command: [...command],
        output,
        exited,
        write(data) {
            ptyProcess.write(inputDecoder.write(data));
        },
        onData(callback) {
            return ptyProcess.onData(callback);
        },
        resize(size) {
            ptyProcess.resize(size.columns, size.rows);
        },
        kill(signal) {
            // WindowsTerminal.kill throws for any signal string; the argument-less
            // kill terminates the conpty process tree instead.
            ptyProcess.kill(process.platform === 'win32' ? undefined : signal);
        },
        pause() {
            ptyProcess.pause?.();
        },
        resume() {
            ptyProcess.resume?.();
        },
        shutdown() {
            ptyProcess.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
        },
        resetInput() {
            inputDecoder = new StringDecoder('utf8');
        },
        dispose() {
            // Match shutdown(): node-pty's signal-less kill falls back to SIGHUP on
            // POSIX, which nohup-style workers ignore.
            ptyProcess.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
            resolveExitOnce({ exitCode: 1 });
            for (const disposable of disposables.splice(0)) {
                disposable.dispose();
            }
        },
    };
}
async function importPty(specifier, name) {
    try {
        const module = await import(specifier);
        const ptyModule = asPtyModule(module);
        return ptyModule ? { module: ptyModule, name } : null;
    }
    catch {
        return null;
    }
}
function asPtyModule(module) {
    if (!isRecord(module) || typeof module['spawn'] !== 'function') {
        return undefined;
    }
    return module;
}
function validateCommand(command) {
    if (command.length === 0 || command.some((part) => part.length === 0)) {
        throw new AgentViewLaunchConfigError([
            'command must contain at least one non-empty string',
        ]);
    }
}
function stringProcessEnv(env) {
    return Object.fromEntries(Object.entries(env).filter((entry) => typeof entry[1] === 'string'));
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireLiteral(record, key, expected, errors) {
    if (record[key] !== expected) {
        errors.push(`${key} must be ${String(expected)}`);
    }
}
function requireNonEmptyString(record, key, errors) {
    if (typeof record[key] !== 'string' || record[key].length === 0) {
        errors.push(`${key} must be a non-empty string`);
    }
}
function validateOptionalString(record, key, errors) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
        errors.push(`${key} must be a string when present`);
    }
}
function requireStringArray(record, key, errors, options = {}) {
    const value = record[key];
    if (!Array.isArray(value)) {
        errors.push(`${key} must be an array of strings`);
        return;
    }
    if (options.nonEmpty && value.length === 0) {
        errors.push(`${key} must not be empty`);
    }
    if (value.some((item) => typeof item !== 'string')) {
        errors.push(`${key} must contain only strings`);
    }
}
function requireStringRecord(record, key, errors) {
    const value = record[key];
    if (!isRecord(value)) {
        errors.push(`${key} must be an object with string values`);
        return;
    }
    if (Object.values(value).some((item) => typeof item !== 'string')) {
        errors.push(`${key} must contain only string values`);
    }
}
function validateTerminal(value, errors) {
    if (!isRecord(value)) {
        errors.push('terminal must be an object');
        return;
    }
    if (!isPositiveInteger(value['columns'])) {
        errors.push('terminal.columns must be a positive integer');
    }
    if (!isPositiveInteger(value['rows'])) {
        errors.push('terminal.rows must be a positive integer');
    }
}
function isPositiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0;
}
//# sourceMappingURL=pty-host.js.map