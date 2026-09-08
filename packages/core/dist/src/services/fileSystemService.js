/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import os from 'node:os';
import * as path from 'node:path';
import { globSync } from 'glob';
import { atomicWriteFile } from '../utils/atomicFileWrite.js';
import { readFileWithLineAndLimit } from '../utils/fileUtils.js';
import { readTextCursorWindowFromHandle, readTextRangeFromHandle, } from '../utils/read-text-range.js';
import { isUtf8CompatibleEncoding } from '../utils/encoding.js';
import { loadIconvLite } from '../utils/load-iconv-lite.js';
import { getSystemEncoding } from '../utils/systemEncoding.js';
/**
 * Supported file encodings for new files.
 */
export const FileEncoding = {
    UTF8: 'utf-8',
    UTF8_BOM: 'utf-8-bom',
};
/**
 * File extensions that require CRLF (\r\n) line endings to function correctly.
 * cmd.exe parses .bat/.cmd files using CRLF delimiters; LF-only endings can
 * break multi-line constructs, labels, and goto statements.
 */
const CRLF_EXTENSIONS = new Set(['.bat', '.cmd']);
/**
 * File extensions that need UTF-8 BOM on Windows with a non-UTF-8 code page.
 * PowerShell 5.1 (the version that ships with Windows) reads BOM-less files
 * using the system's ANSI code page. Without a BOM, any non-ASCII characters
 * in the script will be misinterpreted (e.g. on a GBK system). PowerShell 7+
 * defaults to UTF-8 and handles BOM fine, so adding BOM is always safe.
 */
const UTF8_BOM_EXTENSIONS = new Set(['.ps1']);
// Cache so we only call getSystemEncoding() once per process
let cachedIsNonUtf8Windows;
/**
 * Returns true if a newly created file at the given path should be written
 * with a UTF-8 BOM. Conditions (all must be true):
 * 1. Running on Windows
 * 2. System code page is not UTF-8
 * 3. File extension is in UTF8_BOM_EXTENSIONS (e.g. .ps1)
 */
export function needsUtf8Bom(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!UTF8_BOM_EXTENSIONS.has(ext)) {
        return false;
    }
    if (cachedIsNonUtf8Windows === undefined) {
        if (os.platform() !== 'win32') {
            cachedIsNonUtf8Windows = false;
        }
        else {
            const sysEnc = getSystemEncoding();
            cachedIsNonUtf8Windows = sysEnc !== 'utf-8';
        }
    }
    return cachedIsNonUtf8Windows;
}
/**
 * Reset the UTF-8 BOM cache — useful for testing.
 */
export function resetUtf8BomCache() {
    cachedIsNonUtf8Windows = undefined;
}
/**
 * Returns true if the file at the given path requires CRLF line endings.
 * Only applies on Windows where cmd.exe actually parses these files.
 */
function needsCrlfLineEndings(filePath) {
    if (os.platform() !== 'win32') {
        return false;
    }
    const ext = path.extname(filePath).toLowerCase();
    return CRLF_EXTENSIONS.has(ext);
}
/**
 * Ensures content uses CRLF line endings. First normalizes any existing
 * CRLF to LF to avoid double-conversion, then converts all LF to CRLF.
 */
export function ensureCrlfLineEndings(content) {
    // First normalize CRLF to LF to avoid double-conversion, then convert all LF to CRLF
    return content.split('\r\n').join('\n').split('\n').join('\r\n');
}
/**
 * Detects whether the content uses CRLF or LF line endings.
 * Returns 'crlf' if the content contains at least one CRLF sequence,
 * 'lf' otherwise (including for content with no line endings).
 */
export function detectLineEnding(content) {
    return content.includes('\r\n') ? 'crlf' : 'lf';
}
/**
 * Return the BOM byte sequence for a given encoding name, or null if the
 * encoding does not use a standard BOM. Used when writing back a file that
 * originally had a BOM so the BOM is preserved.
 */
function getBOMBytesForEncoding(encoding) {
    const lower = encoding.toLowerCase().replace(/[^a-z0-9]/g, '');
    switch (lower) {
        case 'utf8':
            return Buffer.from([0xef, 0xbb, 0xbf]);
        case 'utf16le':
        case 'utf16':
            return Buffer.from([0xff, 0xfe]);
        case 'utf16be':
            return Buffer.from([0xfe, 0xff]);
        case 'utf32le':
        case 'utf32':
            return Buffer.from([0xff, 0xfe, 0x00, 0x00]);
        case 'utf32be':
            return Buffer.from([0x00, 0x00, 0xfe, 0xff]);
        default:
            return null;
    }
}
export function prepareTextFileContent(filePath, content, meta, iconvLite) {
    const lineEnding = meta?.['lineEnding'];
    const shouldUseCrlf = needsCrlfLineEndings(filePath) || lineEnding === 'crlf';
    const normalizedContent = shouldUseCrlf
        ? ensureCrlfLineEndings(content)
        : content;
    const bom = meta?.['bom'] ?? false;
    const encoding = meta?.['encoding'];
    // Check if a non-UTF-8 encoding is specified and supported by iconv-lite
    if (encoding && !isUtf8CompatibleEncoding(encoding) && !iconvLite) {
        return undefined;
    }
    if (encoding &&
        !isUtf8CompatibleEncoding(encoding) &&
        iconvLite?.encodingExists(encoding)) {
        // Non-UTF-8 encoding (e.g. GBK, Big5, Shift_JIS, UTF-16LE, UTF-32BE…)
        // Use iconv-lite to encode the content. When the file originally had a BOM
        // (bom: true), prepend the correct BOM bytes for this encoding so the
        // byte-order mark is preserved on write-back.
        const encoded = iconvLite.encode(normalizedContent, encoding);
        if (bom) {
            const bomBytes = getBOMBytesForEncoding(encoding);
            return {
                data: bomBytes ? Buffer.concat([bomBytes, encoded]) : encoded,
            };
        }
        return { data: encoded };
    }
    if (bom) {
        // UTF-8 BOM: prepend EF BB BF
        // If content already starts with the BOM character, strip it first to avoid double BOM.
        const contentWithoutBom = normalizedContent.charCodeAt(0) === 0xfeff
            ? normalizedContent.slice(1)
            : normalizedContent;
        const bomBuffer = Buffer.from([0xef, 0xbb, 0xbf]);
        const contentBuffer = Buffer.from(contentWithoutBom, 'utf-8');
        return { data: Buffer.concat([bomBuffer, contentBuffer]) };
    }
    return { data: normalizedContent, encoding: 'utf-8' };
}
export async function prepareTextFileContentAsync(filePath, content, meta) {
    let prepared = prepareTextFileContent(filePath, content, meta);
    if (!prepared) {
        prepared = prepareTextFileContent(filePath, content, meta, await loadIconvLite());
    }
    if (!prepared) {
        throw new Error('iconv-lite did not prepare non-UTF-8 text content');
    }
    return prepared;
}
export async function encodeTextFileContentAsync(filePath, content, meta) {
    const prepared = await prepareTextFileContentAsync(filePath, content, meta);
    return Buffer.isBuffer(prepared.data)
        ? prepared.data
        : Buffer.from(prepared.data, prepared.encoding ?? 'utf-8');
}
/**
 * Standard file system implementation
 */
export class StandardFileSystemService {
    async readTextFile(params) {
        return readTextFileStandard(params);
    }
    async readTextFileFromHandle(params) {
        if (!Number.isSafeInteger(params.fileSize) || params.fileSize < 0) {
            throw new RangeError(`handle-bound text reads require a non-negative integer fileSize, got ${params.fileSize}`);
        }
        if (!isPositiveSafeInteger(params.maxOutputBytes)) {
            throw new RangeError(`handle-bound text reads require a positive finite maxOutputBytes, got ${params.maxOutputBytes}`);
        }
        if (!isPositiveSafeInteger(params.maxScanBytes)) {
            throw new RangeError(`handle-bound text reads require a positive finite maxScanBytes, got ${params.maxScanBytes}`);
        }
        if (params.limit !== undefined &&
            params.limit !== Number.POSITIVE_INFINITY &&
            !isPositiveSafeInteger(params.limit)) {
            throw new RangeError(`handle-bound text reads require a positive integer limit or Infinity, got ${params.limit}`);
        }
        if (params.line !== undefined &&
            params.line !== null &&
            (!Number.isSafeInteger(params.line) || params.line < 0)) {
            throw new RangeError(`handle-bound text reads require a non-negative integer line, got ${params.line}`);
        }
        const range = await readTextRangeFromHandle(params.fileHandle, {
            offset: params.line ?? 0,
            limit: params.limit ?? Number.POSITIVE_INFINITY,
            fileSize: params.fileSize,
            maxOutputBytes: params.maxOutputBytes,
            maxScanBytes: params.maxScanBytes,
            ...(params.signal !== undefined ? { signal: params.signal } : {}),
        });
        return toReadTextFileResponse(range);
    }
    async readTextCursorFromHandle(params) {
        if (!isPositiveSafeInteger(params.maxOutputBytes)) {
            throw new RangeError(`cursor reads require a positive finite maxOutputBytes, got ${params.maxOutputBytes}`);
        }
        if (!isPositiveSafeInteger(params.maxSnapBytes)) {
            throw new RangeError(`cursor reads require a positive finite maxSnapBytes, got ${params.maxSnapBytes}`);
        }
        if (!Number.isSafeInteger(params.startOffset) ||
            params.startOffset < 0 ||
            !Number.isSafeInteger(params.fileSize) ||
            params.fileSize < 0) {
            throw new RangeError(`cursor reads require non-negative integer startOffset and fileSize, got ${params.startOffset}/${params.fileSize}`);
        }
        if (params.limit !== undefined && !isPositiveSafeInteger(params.limit)) {
            throw new RangeError(`cursor reads require a positive integer limit, got ${params.limit}`);
        }
        return readTextCursorWindowFromHandle(params.fileHandle, {
            startOffset: params.startOffset,
            fileSize: params.fileSize,
            maxOutputBytes: params.maxOutputBytes,
            maxSnapBytes: params.maxSnapBytes,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.signal !== undefined ? { signal: params.signal } : {}),
        });
    }
    async writeTextFile(params) {
        const { path: filePath, _meta } = params;
        const prepared = await prepareTextFileContentAsync(filePath, params.content, _meta);
        if (Buffer.isBuffer(prepared.data)) {
            await atomicWriteFile(filePath, prepared.data);
        }
        else {
            await atomicWriteFile(filePath, prepared.data, {
                encoding: prepared.encoding ?? 'utf-8',
            });
        }
        return { _meta };
    }
    findFiles(fileName, searchPaths) {
        return searchPaths.flatMap((searchPath) => {
            const pattern = path.posix.join(searchPath, '**', fileName);
            return globSync(pattern, {
                nodir: true,
                absolute: true,
            });
        });
    }
}
function isPositiveSafeInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
async function readTextFileStandard(params) {
    const { path, limit, line, maxOutputBytes, signal, stats } = params;
    const readResult = await readFileWithLineAndLimit({
        path,
        limit: limit ?? Number.POSITIVE_INFINITY,
        ...(line !== undefined && line !== null ? { line } : {}),
        ...(maxOutputBytes !== undefined ? { maxOutputBytes } : {}),
        ...(signal !== undefined ? { signal } : {}),
        ...(stats !== undefined ? { stats } : {}),
    });
    return toReadTextFileResponse(readResult);
}
/** Shared metadata shaping so both read paths report identically. */
function toReadTextFileResponse(readResult) {
    const detectedLineEnding = readResult.lineEnding ?? detectLineEnding(readResult.content);
    return {
        content: readResult.content,
        _meta: {
            bom: readResult.bom,
            encoding: readResult.encoding,
            originalLineCount: readResult.originalLineCount,
            originalLineCountExact: readResult.originalLineCountExact,
            lineEnding: detectedLineEnding,
            ...(readResult.truncatedByBytes !== undefined
                ? { truncatedByBytes: readResult.truncatedByBytes }
                : {}),
            ...(readResult.nextByteOffset !== undefined
                ? { nextByteOffset: readResult.nextByteOffset }
                : {}),
        },
    };
}
//# sourceMappingURL=fileSystemService.js.map