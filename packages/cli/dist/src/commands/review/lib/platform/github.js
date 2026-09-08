/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
// GitHub provider for the review-platform read interface. Every call is a
// `gh` invocation through lib/gh.ts (retry, pagination, GH_HOST routing) —
// this module owns the GitHub API *shapes* so the subcommands and the skill
// prose never name an endpoint.
import { ensureAuthenticated, gh, ghApi, ghRaw, isOwnerRepo } from '../gh.js';
function checkOwnerRepo(ownerRepo) {
    if (!isOwnerRepo(ownerRepo)) {
        throw new TypeError(`expected owner/repo, got ${JSON.stringify(ownerRepo)}`);
    }
}
function ghJson(...args) {
    return JSON.parse(gh(...args));
}
/**
 * The host a `gh repo view` URL points at: scheme stripped, authority kept
 * (an explicit port survives — it is part of the host the matcher compares).
 */
function hostOfRepoUrl(url) {
    return url
        .replace(/^[a-z]+:\/\//i, '')
        .split('/')[0]
        .toLowerCase();
}
export const githubReader = {
    kind: 'github',
    ensureAuthenticated,
    resolveRepo() {
        // `gh repo view` resolves through gh's default-repo. That preference is a
        // remote literally NAMED `upstream` when one exists — it is NOT an API
        // fork check: an origin-only fork clone (no `upstream` remote) resolves
        // to the FORK, where the PR does not live, and a same-numbered PR there
        // would hand the review the wrong head SHA. Fetch `parent` and prefer it
        // when the resolved repo is a fork, so a bare PR number always targets
        // the repo that actually hosts PRs (the measured "guessed fork repo"
        // incident the deleted prose recorded).
        const view = ghJson('repo', 'view', '--json', 'owner,name,url,parent');
        const target = view.parent ?? view;
        return {
            // A fork and its parent share one host, and `parent` carries no `url` —
            // so the host comes from the resolved repo's own url, always.
            host: hostOfRepoUrl(view.url),
            owner: target.owner.login,
            repo: target.name,
            // GitHub repos are always exactly two segments.
            groupPath: `${target.owner.login}/${target.name}`.toLowerCase(),
        };
    },
    getPrMeta(prNumber, ownerRepo) {
        checkOwnerRepo(ownerRepo);
        const view = ghJson('pr', 'view', String(prNumber), '--repo', ownerRepo, '--json', 'headRefOid,url');
        return { number: prNumber, headSha: view.headRefOid, webUrl: view.url };
    },
    getClosingIssues(prNumber, ownerRepo) {
        checkOwnerRepo(ownerRepo);
        let view;
        try {
            view = ghJson('pr', 'view', String(prNumber), '--repo', ownerRepo, '--json', 'closingIssuesReferences');
        }
        catch (err) {
            // `closingIssuesReferences` is a --json field only since gh v2.72.0
            // (cli/cli#10544); older gh answers "Unknown JSON field" with no hint
            // that the remedy is an upgrade.
            if (/Unknown JSON field/.test(err.message)) {
                throw new Error('gh >= 2.72.0 is required for closing-issue references ' +
                    '(Unknown JSON field: "closingIssuesReferences") — upgrade gh.');
            }
            throw err;
        }
        return (view.closingIssuesReferences ?? []).map((ref) => ({
            number: ref.number,
            // A PR can close an issue in a DIFFERENT repo — take the repository
            // each reference carries; only a malformed payload falls back to the
            // PR's own repo.
            ownerRepo: ref.repository?.owner?.login
                ? `${ref.repository.owner.login}/${ref.repository.name}`
                : ownerRepo,
        }));
    },
    getIssue(issueNumber, ownerRepo) {
        checkOwnerRepo(ownerRepo);
        const view = ghJson('issue', 'view', String(issueNumber), '--repo', ownerRepo, '--json', 'title,body,comments');
        const comments = (view.comments ?? []).map((c) => ({
            author: c.author?.login ?? '',
            body: c.body ?? '',
            createdAt: c.createdAt ?? '',
        }));
        return {
            number: issueNumber,
            ownerRepo,
            title: view.title ?? '',
            body: view.body ?? '',
            comments,
        };
    },
    fetchDiff(prNumber, ownerRepo) {
        checkOwnerRepo(ownerRepo);
        // ghRaw: a diff's edges are content — a trailing whitespace-only context
        // line is part of the last hunk, and trimming it silently alters what the
        // chunk agents review.
        return ghRaw('pr', 'diff', String(prNumber), '--repo', ownerRepo);
    },
    getCommentBody(kind, id, ownerRepo, prNumber) {
        checkOwnerRepo(ownerRepo);
        let path;
        if (kind === 'review') {
            if (prNumber === undefined) {
                throw new TypeError('review comment bodies are addressed per-PR');
            }
            path = `repos/${ownerRepo}/pulls/${prNumber}/reviews/${id}`;
        }
        else if (kind === 'inline') {
            path = `repos/${ownerRepo}/pulls/comments/${id}`;
        }
        else {
            path = `repos/${ownerRepo}/issues/comments/${id}`;
        }
        // Fetch the JSON object and read `.body` — do NOT `--jq '.body // ""'`,
        // which prints the body plus a trailing newline: a body not ending in one
        // gains a byte, and an empty body becomes "\n" (witnessed). gh's JSON
        // output parses exactly (string content is escape-encoded, so the
        // transport's trim/CRLF-normalise never touches the body bytes).
        const obj = ghApi(path);
        return typeof obj?.body === 'string' ? obj.body : '';
    },
    fetchHeadRefSpec(prNumber) {
        return `pull/${prNumber}/head`;
    },
    getFetchMeta(prNumber, ownerRepo) {
        checkOwnerRepo(ownerRepo);
        const view = ghJson('pr', 'view', String(prNumber), '--repo', ownerRepo, '--json', 'headRefName,headRefOid,baseRefName,additions,deletions,changedFiles,isCrossRepository,body');
        return {
            headRefOid: view.headRefOid,
            headRefName: view.headRefName,
            baseRefName: view.baseRefName,
            isCrossRepository: view.isCrossRepository,
            body: view.body,
            additions: view.additions,
            deletions: view.deletions,
            changedFiles: view.changedFiles,
        };
    },
};
//# sourceMappingURL=github.js.map