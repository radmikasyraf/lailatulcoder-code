/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ArtifactOssConfig, ArtifactPublisher, PublishArtifactInput, PublishedArtifact } from './publisher.js';
/** OSS access credentials, read from the environment by default. */
export interface OssCredentials {
    accessKeyId: string;
    accessKeySecret: string;
    /** STS security token (optional). */
    securityToken?: string;
}
/** Performs the HTTP PUT. Injectable so tests don't hit the network. */
export type HttpPut = (url: string, headers: Record<string, string>, body: string, signal?: AbortSignal) => Promise<void>;
/** Reads OSS credentials from the environment (OSS_* or ALIBABA_CLOUD_*). */
export declare function ossCredentialsFromEnv(env?: NodeJS.ProcessEnv): OssCredentials | undefined;
/**
 * Builds the OSS V1 (HMAC-SHA1) Authorization header and the x-oss-* headers
 * for a PUT Object request. Pure — separated out so the signature is unit
 * testable against a known vector.
 */
export declare function signOssPut(params: {
    credentials: OssCredentials;
    bucket: string;
    key: string;
    contentMd5: string;
    contentType: string;
    date: string;
    acl?: string;
}): {
    authorization: string;
    ossHeaders: Record<string, string>;
};
/**
 * Option C, native Aliyun OSS backend (zero new dependencies). Uploads the
 * artifact with a self-signed PUT Object request over the built-in fetch and
 * returns the public URL. Credentials come from the environment — never stored.
 * The object key is deterministic (`{prefix}/{id}/index.html`), so re-publishing
 * overwrites in place and the URL stays stable.
 */
export declare class OssPublisher implements ArtifactPublisher {
    private readonly config;
    private readonly deps;
    readonly kind = "oss";
    constructor(config: ArtifactOssConfig, deps?: {
        httpPut?: HttpPut;
        credentials?: () => OssCredentials | undefined;
        now?: () => Date;
    });
    publish(input: PublishArtifactInput, signal?: AbortSignal): Promise<PublishedArtifact>;
}
