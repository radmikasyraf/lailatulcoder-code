/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../../config/config.js';
import type { ArtifactPublisher } from './publisher.js';
/**
 * Selects the artifact publisher from config: `oss` (native Aliyun OSS),
 * `host` (upload via a user command), or `local` (file:// on disk, the
 * default). A misconfigured `host`/`oss` selection still
 * returns the publisher, which throws an actionable error at publish time
 * rather than silently falling back.
 */
export declare function createArtifactPublisher(config: Config): ArtifactPublisher;
