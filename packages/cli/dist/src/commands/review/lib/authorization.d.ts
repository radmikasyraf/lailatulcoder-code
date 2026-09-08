/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
export interface WriteAuthorizationRequest {
    /**
     * The skill may pass this only after the user asked, in a message they typed
     * this session, for this review to be published.
     */
    userAuthorized: boolean;
    /**
     * The standing `review.comment` setting, resolved by the caller from
     * settings. When on, a PR review is treated as if `--comment` was passed —
     * the target binding below still applies, so the write remains authorised
     * only for the PR the recorded arguments name.
     */
    defaultComment?: boolean;
    /**
     * Test seam only (there is no session id under vitest). Ignored whenever a
     * session id is present — honouring a caller-supplied path in a real run
     * would hand the gate back the model-writable file the design removed.
     */
    skillArgs?: string;
    /** The pull request this write targets. */
    pr: number;
    /**
     * The `owner/repo` the PR under review lives in, when the caller knows it.
     *
     * Optional because the two callers know different things. `submit` writes TO
     * the pull request, so it always knows (and must bind) the repo it is
     * posting to. `publish-assets` writes to the user-designated assets repo on
     * BEHALF of a PR — the destination is consented to by the designation
     * itself, and the reviewed repo is not among its inputs. Binding the
     * URL-shaped authorisation against the assets repo was the bug this field's
     * optionality fixes: a fork-hosted assets repo plus a URL target refused a
     * legitimately authorised run. When absent, the gate binds the PR number
     * (and host) alone.
     */
    repo?: string;
    /**
     * The EFFECTIVE host of the write — where the gh calls will actually route,
     * including an operator-exported GH_HOST the caller resolved. Absent means
     * github.com, and the gate compares against that default rather than
     * skipping the check: a URL-shaped authorisation recorded for an Enterprise
     * host must not admit a write routed at github.com merely because the
     * caller omitted --host — and vice versa. (The asymmetric `req.host &&`
     * guard this replaces bound the host in one direction only; caught by this
     * skill's own review.)
     */
    host?: string;
}
/**
 * Exactly three things authorise a public write, and all are facts rather than
 * impressions: `--comment` in the arguments the user typed (re-parsed from the
 * CLI's verbatim record), the standing `review.comment` setting, or
 * `--user-authorized`. Authorisation is for a *target*, not a mood: the
 * recorded arguments must name the same pull request (and, for a URL target,
 * the same repo and host) as the write being attempted.
 */
export declare function reviewWriteAuthorization(req: WriteAuthorizationRequest): {
    ok: boolean;
    why: string;
    /**
     * The host the recorded target names, when it names one: a pr-url target
     * carries it; a bare pr-number supplies a recorded `--host` flag or none.
     * The `--user-authorized` fast path reads it best-effort from the
     * recorded args (below) for the same reason the slow path does. Write
     * gates that must reason about the target's PLATFORM read it here
     * instead of re-deriving the platform from the runtime environment alone
     * — the effective host can be steered by an ambient GH_HOST export away
     * from where the recorded review actually lives (submit's Aone refusal
     * uses it to stay shut in both directions).
     */
    recordedHost?: string;
    /**
     * A recording naming this PR exists but yields NO host evidence (see
     * lookupRecordedHost). The platform is unprovable from the recording;
     * the write gate fails closed on this arm rather than trusting the
     * runtime environment alone. Absent on the refusal paths.
     */
    recordedUnbound?: boolean;
    /**
     * True when the slow path authorised from a caller-supplied
     * `--skill-args` path (honoured only when no session id is present) —
     * a recording that belongs to ANOTHER cwd. The write gate must not let
     * the submission cwd's origin probe stand in for such a recording's
     * missing platform evidence: the probe names submit's clone, not the
     * review's, so a hostless override recording fails closed instead.
     * Absent on the fast path and on refusals.
     */
    viaSkillArgsOverride?: boolean;
};
/**
 * Best-effort recovery of the operator's recorded posting floor, shared by
 * the two boundaries that must resolve the floor from the CLI's verbatim
 * record rather than the model-written state: `submit` (the posting write)
 * and `compose-review`'s CLI handler (the archived composed JSON and the
 * terminal verdict). Both resolving through this ONE function — with the
 * SAME identity source — is what keeps the registered artifact and the
 * posted review describing the same floor.
 *
 * **The identity is the CALLER'S CLI-typed one first; the plan only fills
 * the axes the caller did not supply.** The plan's CONTENT is CLI-written,
 * but its PATH arrives through the model-written state JSON — the same
 * document whose floor copy this recovery exists to outrank — so a
 * plan-first precedence let a parseable-but-wrong plan choose which
 * identity the operator's verbatim record was tested against and silently
 * stand the recovery down. Caller-first closes that: at submit the caller
 * pr is additionally gate-bound to the recorded target on the `--comment`
 * path, and both boundaries are fed the same caller identity by the skill
 * (`--pr`/`--repo`/`--host` at compose mirroring submit's own flags), so
 * the two recoveries still resolve one floor for one review.
 *
 * The record is bound to that identity at the SAME bar the `--comment`
 * authorisation applies to the same record: the number always, and — for a
 * URL-shaped record — the repo (when an identity repo is known) and the
 * host, both case-insensitive with an absent host reading as github.com.
 * The record is last-writer-wins (`writeSkillArgs` truncates), so a later
 * `/review` of a different PR — or the same number in a DIFFERENT repo —
 * must recover nothing.
 *
 * Returns the floor with its source only when the record carries an
 * operator decision (`severityFloorSource` of `explicit`/`configured`) —
 * the source rides along so the boundaries' audit notes can name the true
 * origin instead of claiming a flag the operator never typed. A
 * default-resolved `auto` (including one produced by silently discarding an
 * invalid configured value) is not a decision and recovers nothing. Every
 * failure mode — no plan PR, no record, unreadable, no decision, another
 * PR's or repo's record — returns undefined and leaves the caller's state
 * value standing, the same fail-open direction enforcement itself takes.
 * The path rule is the gate's own: the caller-supplied seam is honoured
 * only when no session id is present.
 */
export declare function recordedSeverityFloor(opts: {
    /** The plan of the review being composed or posted — CLI-written content
     * behind a model-written path, so it only FILLS identity axes the caller
     * did not supply, never overrides them. */
    planPath?: string;
    /** The caller's CLI-typed PR number — the identity's first source. */
    callerPr?: number;
    /** The caller's repo — the URL-record bar's first repo source, the plan's
     * `ownerRepo` filling in when absent. */
    callerRepo?: string;
    /** The caller's EFFECTIVE host. Never plan-filled: absent means
     * github.com by the gate's own rule, so there is no gap to fill — the
     * axis where absence is meaningful must not read absence as a gap. */
    callerHost?: string;
    defaultSeverityFloor?: string;
    skillArgs?: string;
}): {
    floor: 'critical' | 'suggestion' | 'auto';
    source: 'explicit' | 'configured';
} | undefined;
