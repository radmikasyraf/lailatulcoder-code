/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/** The attribution marker the strip regex anchors on. */
export declare const FOOTER_MARKER = "via LailatulCoder Ai /review";
/**
 * The invisible marker every attribution-OFF inline comment carries instead
 * of the footer. Renders as nothing on GitHub; it is the one signal that
 * survives the prefix strip and the footer removal, so `presubmit` can still
 * recognize earlier posts for dedup and `pr-context` can still promote an
 * unresolved Critical to the re-check section. The marker carries the
 * severity because the visible prefix that carried it is stripped in this
 * mode. Deliberately not added when attribution is on: the footer and the
 * visible prefix already identify and classify those posts.
 */
export declare const COMMENT_MARKER = "<!-- qwen-review -->";
/** The marker with the finding's severity — the shape `submit` posts. */
export declare function commentMarker(severity: 'critical' | 'suggestion'): string;
/** Whether the body ends with the posted marker shape. */
export declare function carriesCommentMarker(body: string): boolean;
/**
 * The severity a posted marker carries — read ONLY from the trailing shape
 * `submit` appends. An unanchored read returns a marker quoted or planted
 * mid-body (the string is public; a code sample in the reviewed diff can
 * contain it), which would let the plant choose the severity the classifier
 * sees.
 */
export declare function commentMarkerSeverity(body: string): 'critical' | 'suggestion' | null;
/**
 * Whether the invisible marker `submit` appends to an attribution-off post
 * would land INSIDE a code fence (or an HTML block) still open at the
 * body's end — rendered as visible code instead of nothing, with the
 * claim vanished into the fence's info string when the delimiter carries
 * one. The attribution-off prefix strip can move a fence delimiter to
 * line-leading position, creating the exposure on a draft whose delimiter
 * sat mid-line, so the check runs on the POST-strip shape, mirroring the
 * fence refusal `ingestEntryList` applies to the body lists.
 */
export declare function swallowsAppendedMarker(body: string): boolean;
/**
 * Bare marker LINES removed from a body — used by `submit` before appending
 * the canonical marker, so a marker quoted from the reviewed code (or
 * planted to be mistaken for one) cannot survive next to the real one.
 * Fence- and indentation-aware like `stripForgedFooterLines`. The blockquote
 * allowance runs to any depth: a marker renders as nothing quoted at level
 * two exactly as at level one, and a surviving quoted marker beside the
 * canonical one is the plant this strip exists to remove.
 */
export declare function stripCommentMarkerLines(body: string): string;
export declare function stripFooterSpans(text: string): string;
/**
 * The widest string either footer interpolation carries — the modelId and
 * the CLI version both. The footer rides the body's last-resort tail,
 * which the body budget can only hold as a BOUNDED contributor: an
 * unbounded interpolation emptied the rung-3 cut — and past the budget
 * composed a body GitHub rejects whole, blockers included. Real model
 * names and version stamps are a few dozen characters.
 */
export declare const MODEL_ID_MAX_CHARS = 200;
/** The footer naming the reviewing model and the CLI version it ran under. */
export declare function reviewFooter(modelId: string, cliVersion: string): string;
/**
 * One or more trailing footers, with the whitespace around them.
 *
 * Two invariants keep the match from exploding on the model-authored bodies
 * this regex strips, both against the same failure shape — a forged-footer
 * run the trailing `$` cannot match (footers followed by ordinary text is
 * the natural output of a model looping on the same comment): the leading
 * `\s*` sits OUTSIDE the repeated group, so the whitespace between two
 * footers has exactly one owner instead of being splittable across
 * iterations, and the guarded `[^\n]` cannot consume past another footer's
 * start, so a run of footers joined on ONE line parses exactly one way
 * instead of the 2^(N-1) partitions the engine otherwise enumerates before
 * giving up.
 *
 * The closing `_` is optional because a looping model truncates the forged
 * footer it cuts off mid-character, and an unstripped unclosed copy would
 * post as a duplicate attribution line above the canonical one. The closing
 * paren of the version group is optional for the same reason: most
 * mid-character cuts land inside the parens — the footer's final ~10
 * characters.
 *
 * The version CONTENT is bounded to the shape `footerVersion` validates —
 * FOOTER_SPAN_RE's treatment. An unbounded run made the optional paren eat
 * authored prose after a cut opened inside the parens when the match
 * succeeded, and enumerate exponential whitespace partitions when it
 * failed: the version span both swallowed subsequent footers on a line and
 * split trailing whitespace with the `\s*` after it, so a refusing footer
 * run no longer parsed exactly one way. The capped trailing `…`
 * `reviewFooter` writes for an interpolation past MODEL_ID_MAX_CHARS is
 * admitted — the canonical capped footer must strip like any forged one.
 */
export declare const REVIEW_FOOTER_RE: RegExp;
/**
 * Strip trailing footers when present, and nothing else.
 *
 * Bounded twice, because the strip regex opens `\s*` under an unanchored
 * search, which scans quadratically on a long whitespace run — and these
 * bodies are model-written with no length cap (measured ~20 s at 80k
 * characters). The marker guard returns marker-less bodies unchanged
 * without running the regex at all, but it cannot help a body that CONTAINS
 * the marker: a quoted or truncated forged footer is the natural output of
 * the model loop this strip exists for, and the match still ran the
 * unanchored search over the whole body when no trailing footer matched
 * (probe-measured ~4× per doubling of the whitespace run). So the match
 * runs only over the last STRIP_TAIL_LIMIT characters — the regex is
 * `$`-anchored, so a match can only live at the tail, and one footer is
 * ~40 characters, which bounds the strip to a few hundred accumulated
 * footers, far past any real re-compose loop. Bounding at the last marker
 * occurrence does NOT work: the whitespace run sits after the last marker
 * line and stays inside that bound. Shared by both strip sites —
 * `compose-review`'s drafted entries and `submit`'s inline comments —
 * because one guard is one guard, and a second copy is how one site
 * eventually forgets it.
 *
 * The match runs on the displayed projection — a comment or entity inside
 * the marker phrase cannot hide a trailing forged footer (or forge one:
 * the cut maps back to the original bytes) — and the projection of a
 * marker-less tail returns the body byte-identical without the regex.
 */
export declare function stripReviewFooter(body: string): string;
/**
 * Whether what remains would render as NOTHING on GitHub. Whitespace,
 * format characters (Cf, e.g. zero-width spaces — `.trim()` does not see
 * them), HTML comments — terminated or not: an unclosed `<!--` runs to the
 * end of the input and swallows the marker this post would append — the
 * sanitizer-dropped raw-HTML blocks (script/style, `<?…?>`, `<!DOCTYPE …>`),
 * the entities decoding to nothing visible (the no-break, space, and
 * named-invisible families), empty elements, void tags, empty links (an
 * empty-alt IMAGE still renders its `<img>`), blockquote-punctuation-only
 * lines, link reference definitions — validated, with a title-continuation
 * line consumed — hollowed fence delimiters, and forged-footer lines are
 * not content. The emptiness gates must project through this before
 * comparing to '', or a scaffolded-but-invisible comment posts, counts
 * toward the verdict, and re-promotes as an unanswerable blocker. This is a
 * judgment projection, not a sanitizer, so it is deliberately fence-blind: a
 * quotation of scaffolding is still not a finding.
 */
export declare function rendersAsNothing(text: string): boolean;
export declare function stripForgedFooterLines(body: string): string;
export declare function stripParagraphMarkers(body: string): string;
/**
 * The full attribution-off sanitation, iterated to a fixpoint: forged
 * footer lines, severity prefixes, bare marker lines, and footer spans
 * interleave arbitrarily in a looping model's draft (a marker line between
 * two prefixes stops a single prefix pass; a footer span ahead of a marker
 * defeats a marker-first chain), and only a chain that keeps running until
 * nothing changes posts none of them. Every attribution-off leg — submit's
 * post transform and gate, compose's body lists, the ledger titles — goes
 * through here so the sites cannot drift.
 */
export declare function stripForUnattributedPost(body: string): string;
/**
 * A modelId the footer can interpolate. The footer is one line, and the
 * strip regex anchors on the marker: a modelId carrying a newline or the
 * marker itself builds a footer the strip cannot remove on a second pass, so
 * a re-compose loop would accumulate attribution lines instead of
 * normalizing to one.
 */
export declare function isFooterSafeModelId(modelId: string): boolean;
/**
 * The startup-version stamp, when the footer can carry it. The stamp rides
 * an environment variable any wrapper can set; a value with a newline or a
 * `)` (both stop the strip regex early) would build a footer the strip
 * cannot remove on a second pass. Anything but the shape of a real package
 * version yields undefined so the caller falls back to its own version.
 */
export declare function footerVersion(stamp: string | undefined): string | undefined;
