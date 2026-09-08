/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface RemoteIdentity {
    host: string;
    owner: string;
    repo: string;
    /**
     * The FULL normalized path (`group/subgroup/project`) when the remote URL
     * carries three or more segments — the collapse to owner/repo is
     * non-injective, and matchRemotes compares every segment when both sides
     * carry a path. Two-segment remotes repeat `owner/repo` here.
     */
    groupPath: string;
}
/** Lowercase and strip one trailing `.git`, the normal form comparison runs in. */
export declare function normalizeSegment(value: string): string;
/** Hosts compare equal when identical, or both are an Aone web/git alias. */
export declare function hostsEquivalent(a: string, b: string): boolean;
/** The CANONICAL Aone hosts, normalized through the shared spelling helper
 *  — but strict: no `.alibaba-inc.com` wildcard. Write routing keys on
 *  THIS, not the family: a bare `*.alibaba-inc.com` suffix also names
 *  GitHub Enterprise instances (an org's `ghe.alibaba-inc.com`), and an
 *  irreversible public write must not select the a1 path on a family
 *  resemblance. */
export declare function isAoneCanonicalHost(host: string | undefined): boolean;
/** Hosts that count as the Aone platform family — one canonical predicate,
 *  shared by every guard that asks "is this origin on Aone" (registry
 *  detection and aone.fetchDiff's origin guard both key on it). Normalizes
 *  the way a remote URL can spell the same DNS name: a port, one trailing
 *  dot (FQDN form), and case — so a dotted-spelling clone cannot pass
 *  detection and then be refused by a gate that normalized differently. */
export declare function isAoneHostFamily(host: string | undefined): boolean;
/**
 * Parse one remote URL into its host / owner / repo, or null when it is
 * neither of the two shapes `git remote -v` prints for a GitHub-style host —
 * `git@<host>:<owner>/<repo>(.git)` and `https://<host>/<owner>/<repo>(.git)`
 * — nor the `ssh://` spelling of the first. Two-or-more path segments collapse
 * to the LAST two (nested-group repos, e.g. Aone `group/subgroup/project`);
 * a local path, a scheme-less name without a `host:path` shape, or a bundle
 * file is not a candidate and never matches. Host comparison at the call site
 * runs through `hostsEquivalent` (Aone web/git alias), not raw equality.
 */
export declare function parseRemoteUrl(raw: string): RemoteIdentity | null;
export interface RemoteMatchInput {
    owner: string;
    repo: string;
    /** Defaults to `github.com` — a PR URL's host, or github.com for bare numbers. */
    host?: string;
    /**
     * The target's FULL group path when its URL grammar carries one (Aone
     * nested groups). When BOTH sides have three or more segments the match
     * compares every segment — the owner/repo collapse alone is non-injective
     * and would match a different group's same-named repo.
     */
    groupPath?: string;
}
export interface RemoteMatchOutcome {
    /** Remote names whose FETCH url is an exact-segment match, in `git remote -v` order. */
    matched: string[];
}
/**
 * Match an owner/repo/host against the raw output of `git remote -v`.
 *
 * Only `(fetch)` lines count: `fetch-pr` fetches `pull/<n>/head` through the
 * remote's fetch URL, and a remote whose push URL alone pointed at the repo
 * could not serve it. A remote appears twice (fetch and push); matching the
 * fetch lines alone also dedupes.
 */
export declare function matchRemotes(remoteVOutput: string, { owner, repo, host, groupPath }: RemoteMatchInput): RemoteMatchOutcome;
