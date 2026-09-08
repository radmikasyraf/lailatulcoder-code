/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
class FileExporter {
    writeStream;
    constructor(filePath) {
        // Telemetry is best-effort and must never crash the process. Ensure the
        // parent directory exists (the outfile may be a relative path resolved
        // against a cwd that lacks it), and attach an `error` handler so an open or
        // write failure (missing/read-only dir, EACCES) is absorbed instead of
        // surfacing as an unhandled stream `error` event that takes down the agent.
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        catch {
            // Directory could not be created; the stream error handler below will
            // absorb the resulting open failure.
        }
        this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
        this.writeStream.on('error', () => {
            // Swallow telemetry file errors — exporters report failures through the
            // ExportResult callback; an unhandled `error` event would crash Node.
        });
    }
    serialize(data) {
        return safeJsonStringify(data, 2) + '\n';
    }
    shutdown() {
        return new Promise((resolve) => {
            this.writeStream.end(resolve);
        });
    }
}
export class FileSpanExporter extends FileExporter {
    export(spans, resultCallback) {
        const data = spans.map((span) => this.serialize(span)).join('');
        this.writeStream.write(data, (err) => {
            resultCallback({
                code: err ? ExportResultCode.FAILED : ExportResultCode.SUCCESS,
                error: err || undefined,
            });
        });
    }
}
export class FileLogExporter extends FileExporter {
    export(logs, resultCallback) {
        const data = logs.map((log) => this.serialize(log)).join('');
        this.writeStream.write(data, (err) => {
            resultCallback({
                code: err ? ExportResultCode.FAILED : ExportResultCode.SUCCESS,
                error: err || undefined,
            });
        });
    }
    async forceFlush() {
        // Writes go through the stream callback above; nothing extra to flush.
    }
}
export class FileMetricExporter extends FileExporter {
    export(metrics, resultCallback) {
        const data = this.serialize(metrics);
        this.writeStream.write(data, (err) => {
            resultCallback({
                code: err ? ExportResultCode.FAILED : ExportResultCode.SUCCESS,
                error: err || undefined,
            });
        });
    }
    getPreferredAggregationTemporality() {
        return AggregationTemporality.CUMULATIVE;
    }
    async forceFlush() {
        return Promise.resolve();
    }
}
//# sourceMappingURL=file-exporters.js.map