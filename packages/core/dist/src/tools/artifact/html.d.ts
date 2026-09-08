/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Pure helpers for the Artifact tool: wrap a body-only HTML fragment into a
 * self-contained document, validate it has no external dependencies, and
 * normalize the title. No I/O — kept side-effect free so it is trivially
 * unit-testable and reused by every publisher backend.
 */
/** Upload/byte ceiling for a published artifact (mirrors CC's MAX_ARTIFACT_BYTES). */
export declare const MAX_ARTIFACT_BYTES: number;
/**
 * Collapses whitespace and clamps an artifact title to a sane length. Falls
 * back to a default so the document always has a usable <title>.
 */
export declare function sanitizeArtifactTitle(raw: string | undefined): string;
/**
 * Heuristic check that a fragment is a self-contained body fragment with no
 * external dependencies. Returns an error string (model-facing, actionable) or
 * null when the fragment passes.
 *
 * This is a deliberately simple scanner, not a full HTML/CSS/JS parser: it
 * catches the common mistakes (full-document wrappers, CDN scripts, external
 * stylesheets/fonts/images, JS network calls, protocol-relative URLs). The
 * generated wrapper also adds a browser CSP as a second no-egress guard.
 */
export declare function validateSelfContained(fragment: string): string | null;
/**
 * Wraps a body-only fragment into a complete, responsive, self-contained HTML
 * document with the given title and a baseline CSS reset.
 */
export declare function wrapArtifactHtml(bodyFragment: string, title: string | undefined): string;
/** UTF-8 byte length of a string. */
export declare function byteLength(s: string): number;
