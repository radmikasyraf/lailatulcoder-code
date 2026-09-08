/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Resolve the merge-base of a PR head and its base branch.
 *
 * The remote-tracking ref is preferred because a CI checkout has no local
 * base branch; the local ref is the fallback for a developer who has one
 * but is offline. Null means neither resolved, and the caller degrades to
 * a diff-less report rather than failing the whole review.
 *
 * The tracking-ref candidate is FULLY QUALIFIED (`refs/remotes/…`): git
 * resolves an unqualified `origin/<name>` in `refs/tags` and `refs/heads`
 * BEFORE `refs/remotes`, so a tag or branch literally named
 * `origin/<baseRefName>` — a pushable, SERVER-CONTROLLED refname a plain
 * clone auto-carries — would shadow the just-fetched tracking ref and
 * silently move the base.
 */
export function resolveMergeBase(remote, baseRefName, headRef, git) {
    const baseFetchFailed = !git.fetch(remote, baseRefName);
    for (const candidate of [
        `refs/remotes/${remote}/${baseRefName}`,
        baseRefName,
    ]) {
        if (!git.refExists(candidate))
            continue;
        const mb = git.mergeBase(candidate, headRef);
        if (mb)
            return { sha: mb, baseFetchFailed };
    }
    return { sha: null, baseFetchFailed };
}
//# sourceMappingURL=merge-base.js.map