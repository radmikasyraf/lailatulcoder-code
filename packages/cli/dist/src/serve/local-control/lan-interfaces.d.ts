/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface LanCandidate {
    /** OS interface name, e.g. `en0` / `wlan0`. */
    readonly interfaceName: string;
    /** IPv4 literal to bind and advertise. */
    readonly address: string;
}
/** Every private/link-local IPv4 the host currently has, sorted for stable output. */
export declare function listLanCandidates(interfaces?: NodeJS.Dict<import("os").NetworkInterfaceInfo[]>): LanCandidate[];
export declare class NoLanInterfaceError extends Error {
    readonly code = "no_lan_interface";
    constructor();
}
export declare class AmbiguousLanInterfaceError extends Error {
    readonly code = "ambiguous_lan_interface";
    readonly candidates: readonly LanCandidate[];
    constructor(candidates: readonly LanCandidate[]);
}
export declare class UnknownLanInterfaceError extends Error {
    readonly code = "unknown_lan_interface";
    constructor(requested: string);
}
/**
 * Pick the address to bind.
 *
 * Ambiguity is surfaced, not resolved. The Rust implementation failed outright
 * when a host had more than one LAN address and
 * the CLI printed a QR for every one, leaving the user to guess. Neither is
 * right: the caller gets {@link AmbiguousLanInterfaceError} carrying the
 * candidates so the Web Shell can ask, and can then pass `preferredAddress` to
 * commit to an answer.
 */
export declare function selectLanAddress(preferredAddress?: string, interfaces?: NodeJS.Dict<import("os").NetworkInterfaceInfo[]>): LanCandidate;
