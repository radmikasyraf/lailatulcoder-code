/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Verifies an Ed25519 signature over the SHA256SUMS content.
 * @param sha256sumsContent - The raw text of SHA256SUMS
 * @param signatureBase64 - Base64-encoded 64-byte Ed25519 signature
 * @throws if signature is invalid or verification fails
 */
export declare function verifySignature(sha256sumsContent: string, signatureBase64: string): void;
