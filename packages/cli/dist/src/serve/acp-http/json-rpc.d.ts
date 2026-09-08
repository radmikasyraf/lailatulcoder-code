/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Minimal JSON-RPC 2.0 helpers for the ACP-over-HTTP transport
 * (`packages/cli/src/serve/acp-http/`). The official ACP Streamable HTTP
 * transport (RFD #721) frames every message as a JSON-RPC 2.0 object;
 * this module owns the wire types + parse/validate/serialize so the
 * dispatcher stays focused on bridge routing.
 *
 * We hand-roll framing (rather than reuse `@agentclientprotocol/sdk`'s
 * `ndJsonStream`) because the RFD splits a single logical connection
 * across multiple long-lived SSE streams (connection-scoped + one per
 * session), so outbound frames must be demultiplexed to the right
 * stream — something a single duplex `Connection` can't express.
 */
/**
 * Vendor extension namespace. ACP reserves any `_`-prefixed method for
 * extensions (the ONLY hard rule); the spec's `_zed.dev/…` example shows a
 * domain-style segment by convention, but `qwen` is distinctive enough that
 * we use the shorter bare form `_qwen/…`. Vendor data on standard messages
 * goes under `_meta` keyed by the same name (`_meta: { "qwen": … }`).
 */
export declare const QWEN_METHOD_NS = "_qwen/";
/** Key for vendor `_meta` blocks (capabilities + per-message data). */
export declare const QWEN_META_KEY = "qwen";
export type JsonRpcId = number | string;
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: JsonRpcId;
    method: string;
    params?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}
export interface JsonRpcSuccess {
    jsonrpc: '2.0';
    id: JsonRpcId;
    result: unknown;
}
export interface JsonRpcErrorObject {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcError {
    jsonrpc: '2.0';
    id: JsonRpcId | null;
    error: JsonRpcErrorObject;
}
export type JsonRpcOutbound = JsonRpcRequest | JsonRpcNotification;
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;
export type JsonRpcInbound = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
/** Standard JSON-RPC 2.0 error codes. */
export declare const RPC: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
};
export declare function isObject(v: unknown): v is Record<string, unknown>;
export declare function isRequest(m: unknown): m is JsonRpcRequest;
export declare function isNotification(m: unknown): m is JsonRpcNotification;
export declare function isResponse(m: unknown): m is JsonRpcResponse;
/**
 * Strip terminal control chars from values interpolated into operator-facing
 * stderr logs, so a client-controlled `sessionId`/`method`/error string can't
 * forge or split log lines (log injection). Shared by the transport modules.
 */
export declare function logSafe(s: string): string;
export declare function success(id: JsonRpcId, result: unknown): JsonRpcSuccess;
export declare function error(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcError;
export declare function notification(method: string, params: unknown): JsonRpcNotification;
export declare function request(id: JsonRpcId, method: string, params: unknown): JsonRpcRequest;
/**
 * Parse a request body into a JSON-RPC message. Returns `{ ok: false }`
 * with a ready-to-send error on malformed JSON or a non-conforming
 * envelope (batch arrays are rejected per RFD §"batch → 501", surfaced
 * here as INVALID_REQUEST since we never reach the 501 path).
 */
export declare function parseInbound(raw: unknown): {
    ok: true;
    message: JsonRpcInbound;
} | {
    ok: false;
    error: JsonRpcError;
};
