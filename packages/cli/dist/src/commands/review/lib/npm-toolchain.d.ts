/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type WorkspacePackage } from './workspaces.js';
import type { ReviewToolchainAdapter } from './toolchain.js';
/**
 * The one grammar `testCommand` above emits. Exported for the `--resume`
 * shape gate: a continuation re-executes report-stored `test[].command`
 * strings verbatim under `shell: true`, and the run-identity check pins a
 * report to this run's TREE, not to this program's authorship — a report
 * edited in place keeps its identity. Anything outside the emitter's own
 * grammar is therefore refused before it can be re-run — and `test-delta`
 * imports this same predicate for the report commands it re-runs: one
 * grammar, beside the emitter, for every site that hands a stored command
 * to a shell, so a grammar change cannot silently diverge the two gates.
 * The character class covers every workspace dir this repo shape produces;
 * a dir exotic enough to fall outside it costs that report its resume (a
 * named refusal, pointing at a fresh run), never a verbatim re-execution.
 */
export declare const TEST_COMMAND_RE: RegExp;
/**
 * Workspace packages the compiler said it could not resolve.
 *
 * Only names that belong to a workspace of *this* repo are returned. A missing
 * third-party module is a broken install or a genuine defect in the diff — not
 * something a wider build set can fix — and widening on it would loop.
 */
export declare function unresolvedWorkspaceDeps(output: string, packages: WorkspacePackage[]): string[];
export declare const npmToolchainAdapter: ReviewToolchainAdapter;
