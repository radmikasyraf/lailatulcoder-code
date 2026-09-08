/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { open } from 'yauzl';
import { stripAnsiAndControl } from '../utils/textUtils.js';
const ZIP_FILE_TYPE_MASK = 0xf000;
const ZIP_DIRECTORY_TYPE = 0x4000;
const ZIP_SYMBOLIC_LINK_TYPE = 0xa000;
const ZIP_DOS_DIRECTORY_ATTRIBUTE = 16;
const MAX_REPORTED_ZIP_PATH_LENGTH = 200;
function formatZipPath(value) {
    const sanitized = stripAnsiAndControl(value);
    if (sanitized.length <= MAX_REPORTED_ZIP_PATH_LENGTH)
        return sanitized;
    return `${sanitized.slice(0, MAX_REPORTED_ZIP_PATH_LENGTH - 3)}...`;
}
function isWithinRoot(root, candidate) {
    const relative = path.relative(root, candidate);
    return (relative === '' ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative)));
}
function getEntryMode(entry) {
    return (entry.externalFileAttributes >>> 16) & 0xffff;
}
function isDirectoryEntry(entry, mode) {
    if ((mode & ZIP_FILE_TYPE_MASK) === ZIP_DIRECTORY_TYPE)
        return true;
    if (entry.fileName.endsWith('/'))
        return true;
    const madeBy = entry.versionMadeBy >>> 8;
    return (madeBy === 0 && entry.externalFileAttributes === ZIP_DOS_DIRECTORY_ATTRIBUTE);
}
function isSymbolicLinkEntry(mode) {
    return (mode & ZIP_FILE_TYPE_MASK) === ZIP_SYMBOLIC_LINK_TYPE;
}
function openZipFile(file, signal) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        let aborted = false;
        const onAbort = () => {
            aborted = true;
            reject(signal?.reason);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        open(file, { lazyEntries: true }, (error, zipFile) => {
            signal?.removeEventListener('abort', onAbort);
            if (aborted || signal?.aborted) {
                zipFile?.close();
                reject(signal?.reason);
            }
            else if (error) {
                reject(error);
            }
            else {
                resolve(zipFile);
            }
        });
    });
}
function openEntryStream(zipFile, entry, signal) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        zipFile.openReadStream(entry, (error, stream) => {
            if (error) {
                reject(error);
            }
            else if (signal?.aborted) {
                stream.destroy();
                reject(signal.reason);
            }
            else {
                resolve(stream);
            }
        });
    });
}
async function rejectExistingSymbolicLink(destination) {
    try {
        const stats = await fs.promises.lstat(destination);
        if (stats.isSymbolicLink()) {
            throw new Error(`Refusing to extract through existing symbolic link: ${formatZipPath(destination)}`);
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
}
async function ensureDirectoryWithinRoot(root, destination, mode) {
    const relative = path.relative(root, destination);
    const segments = relative.split(path.sep).filter(Boolean);
    let current = root;
    for (const [index, segment] of segments.entries()) {
        current = path.join(current, segment);
        try {
            const stats = await fs.promises.lstat(current);
            if (stats.isSymbolicLink() || !stats.isDirectory()) {
                throw new Error(`Refusing to extract through non-directory path: ${formatZipPath(current)}`);
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            try {
                await fs.promises.mkdir(current, {
                    ...(index === segments.length - 1 && mode !== undefined
                        ? { mode }
                        : {}),
                });
            }
            catch (mkdirError) {
                if (mkdirError.code !== 'EEXIST') {
                    throw mkdirError;
                }
                const stats = await fs.promises.lstat(current);
                if (stats.isSymbolicLink() || !stats.isDirectory()) {
                    throw new Error(`Refusing to extract through non-directory path: ${formatZipPath(current)}`);
                }
            }
        }
    }
    const canonical = await fs.promises.realpath(destination);
    if (!isWithinRoot(root, canonical)) {
        throw new Error(`Out of bound path "${formatZipPath(canonical)}" found while preparing extraction`);
    }
}
async function extractEntry(zipFile, entry, root, signal) {
    signal?.throwIfAborted();
    if (entry.fileName.startsWith('__MACOSX/'))
        return;
    const mode = getEntryMode(entry);
    const reportedEntryName = formatZipPath(entry.fileName);
    if (isSymbolicLinkEntry(mode)) {
        throw new Error(`Zip archive contains unsupported symbolic link entry: ${reportedEntryName}`);
    }
    const destination = path.resolve(root, entry.fileName);
    if (!isWithinRoot(root, destination)) {
        throw new Error(`Out of bound path "${formatZipPath(destination)}" found while processing file ${reportedEntryName}`);
    }
    const isDirectory = isDirectoryEntry(entry, mode);
    const permissions = (mode || (isDirectory ? 0o755 : 0o644)) & 0o777;
    const destinationDirectory = isDirectory
        ? destination
        : path.dirname(destination);
    await ensureDirectoryWithinRoot(root, destinationDirectory, isDirectory ? permissions : undefined);
    signal?.throwIfAborted();
    if (isDirectory)
        return;
    await rejectExistingSymbolicLink(destination);
    signal?.throwIfAborted();
    const readStream = await openEntryStream(zipFile, entry, signal);
    try {
        await pipeline(readStream, fs.createWriteStream(destination, { mode: permissions }), { signal });
    }
    catch (error) {
        readStream.destroy();
        signal?.throwIfAborted();
        throw error;
    }
}
function extractEntries(zipFile, root, signal) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            zipFile.removeListener('close', onClose);
            zipFile.removeListener('entry', onEntry);
            if (error === undefined)
                resolve();
            else
                reject(error);
        };
        const fail = (error) => {
            finish(error);
            zipFile.close();
        };
        const onAbort = () => fail(signal?.reason);
        const onError = (error) => fail(error);
        const onClose = () => {
            zipFile.removeListener('error', onError);
            finish();
        };
        const onEntry = (entry) => {
            void extractEntry(zipFile, entry, root, signal).then(() => {
                if (!settled)
                    zipFile.readEntry();
            }, (error) => fail(error));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        zipFile.on('error', onError);
        zipFile.on('close', onClose);
        zipFile.on('entry', onEntry);
        if (signal?.aborted)
            onAbort();
        else
            zipFile.readEntry();
    });
}
export async function extractZipArchive(file, destination, signal) {
    signal?.throwIfAborted();
    if (!path.isAbsolute(destination)) {
        throw new Error('Target directory is expected to be absolute');
    }
    await fs.promises.mkdir(destination, { recursive: true });
    const root = await fs.promises.realpath(destination);
    signal?.throwIfAborted();
    const zipFile = await openZipFile(file, signal);
    try {
        await extractEntries(zipFile, root, signal);
    }
    catch (error) {
        signal?.throwIfAborted();
        throw error;
    }
}
//# sourceMappingURL=zip-extraction.js.map