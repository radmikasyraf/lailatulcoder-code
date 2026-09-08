/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as http from 'node:http';
import * as https from 'node:https';
export function clientForUrl(url) {
    const protocol = new URL(url).protocol.toLowerCase();
    if (protocol === 'https:') {
        return https;
    }
    if (protocol === 'http:') {
        return http;
    }
    throw new Error(`Unsupported URL protocol: ${protocol}`);
}
//# sourceMappingURL=http-client.js.map