/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { resolve as resolvePath } from 'node:path';
import { hasVerifiableInode } from '../utils/file-identity.js';
export class FileReadCache {
    byInode = new Map();
    static MAX_ENTRIES = 4096;
    /** Build the canonical key for a file from its Stats. */
    static inodeKey(stats) {
        return `${stats.dev}:${stats.ino}`;
    }
    /** See {@link hasVerifiableInode}. */
    static hasVerifiableIdentity(stats) {
        return hasVerifiableInode(stats.ino);
    }
    /**
     * Record a successful Read of `absPath`.
     *
     *  - `full`      — the Read produced the entire current content of
     *    the file: no offset / limit / pages on the request AND the
     *    output was not truncated. Pass `false` for ranged reads OR
     *    for full-request reads whose content was truncated by the
     *    truncate-tool-output limit; both leave the model without
     *    sight of every current byte. This gates the `file_unchanged`
     *    fast-path and notebook-specific prior-read checks.
     *  - `cacheable` — the produced content is plain text (vs. binary /
     *    image / audio / video / PDF / notebook). This flag is purely
     *    about content type, not about whether the read was complete:
     *    a partial / truncated text read still records `cacheable: true`
     *    because the bytes the model saw were text. (Bundling
     *    truncation into `cacheable` was the issue #3964 regression
     *    that caused partial reads of `.kt` / `.cpp` / `.py` files to
     *    be rejected on the next Edit with a misleading "binary
     *    payload" message.)
     *
     * The `lastReadWasFull` and `lastReadCacheable` flags are
     * **sticky-on-true** when the recorded fingerprint matches the
     * existing entry's `(mtimeMs, sizeBytes)`. That preserves the
     * model's read-rights across `Read full → Read partial` and
     * `WriteFile(create) → Read partial → Edit` sequences against
     * the same bytes.
     *
     * When the fingerprint drifts — i.e. the file was mutated between
     * the prior record and this one — the flags are **reset** to
     * exactly what this read produced. Sticky-on-true across drift
     * would let a `Read full @X → external write → Read partial @Y →
     * Edit` sequence pass enforcement against bytes the model only
     * saw the first 10 lines of, exactly the regression flagged in
     * the maintainer review.
     *
     * The fast-path `file_unchanged` check still gates on the
     * incoming request's own `isFullRead` (in `read-file.ts`), so a
     * partial read does not get a placeholder it shouldn't.
     *
     * When `stats.ino` is `0` the read is not stored and the returned
     * entry is **detached**: it describes this read for the immediate
     * caller, but it is not in the map, so mutating it has no effect
     * and a later {@link check} still reports `unverifiable`.
     */
    recordRead(absPath, stats, opts) {
        if (!FileReadCache.hasVerifiableIdentity(stats)) {
            const entry = FileReadCache.createEntry(absPath, stats);
            entry.lastReadAt = Date.now();
            entry.readResidentInHistory = opts.full;
            entry.lastReadWasFull = opts.full;
            entry.lastReadCacheable = opts.cacheable;
            return entry;
        }
        const key = FileReadCache.inodeKey(stats);
        const existing = this.byInode.get(key);
        const sameFingerprint = existing !== undefined &&
            existing.mtimeMs === stats.mtimeMs &&
            existing.sizeBytes === stats.size;
        const entry = this.upsert(absPath, stats);
        entry.lastReadAt = Date.now();
        if (opts.full) {
            // Only a full read re-arms: a partial read leaves a mere slice
            // in history while sticky `lastReadWasFull` stays true, so
            // re-arming on it would resurrect a dangling placeholder for an
            // evicted full read. Leaving it untouched for partial reads is
            // correct either way (a still-resident full read stays true).
            entry.readResidentInHistory = true;
        }
        if (sameFingerprint) {
            // Same bytes the entry already described — sticky-on-true
            // preserves prior `true` flags from full reads or writes.
            if (opts.full) {
                entry.lastReadWasFull = true;
            }
            if (opts.cacheable) {
                entry.lastReadCacheable = true;
            }
        }
        else {
            // Drift detected (or fresh entry): the prior flags described
            // different bytes. Reset to what this read actually produced.
            // `readResidentInHistory` is intentionally NOT reset here — it
            // tracks whether the read is still quotable from history, which
            // is orthogonal to the on-disk fingerprint and already handled
            // by the `opts.full` branch above.
            entry.lastReadWasFull = opts.full;
            entry.lastReadCacheable = opts.cacheable;
        }
        return entry;
    }
    /**
     * Record a successful write (Edit, WriteFile, or any other tool that
     * mutates the file's bytes). After a write the on-disk mtime/size will
     * differ from any prior Read snapshot, so we refresh the cached
     * fingerprint to the post-write Stats; otherwise the next Edit would
     * see its own write as a "stale" external change.
     *
     * Read metadata is **always** refreshed alongside the write, not
     * just for brand-new entries: the model authored the current content
     * produced by the mutating tool, so for prior-read enforcement purposes
     * it has now "seen" the bytes that tool wrote. Plain text writers use
     * the default `cacheable: true`; structured writers such as notebook cell
     * editors can set `cacheable: false` so regular Edit / WriteFile still
     * reject the file as a non-text payload.
     *
     * As with {@link recordRead}, an `ino === 0` write returns a
     * **detached** entry that was never added to the map.
     */
    recordWrite(absPath, stats, opts = {}) {
        const entry = FileReadCache.hasVerifiableIdentity(stats)
            ? this.upsert(absPath, stats)
            : FileReadCache.createEntry(absPath, stats);
        const now = Date.now();
        entry.lastWriteAt = now;
        entry.lastReadAt = now;
        entry.lastReadWasFull = true;
        entry.lastReadCacheable = opts.cacheable ?? true;
        // The model authored the current bytes and that result is in
        // history, so the fast-path may serve a placeholder again.
        entry.readResidentInHistory = true;
        return entry;
    }
    /**
     * Compare the cached fingerprint against `stats` for the same inode.
     *
     *  - `unverifiable` — the filesystem reported `ino === 0`, so the
     *    file identity cannot be safely compared or cached.
     *  - `unknown` — no entry. The file has never been Read or written in
     *    this session.
     *  - `stale`   — entry exists but mtime or size differs. The file has
     *    been changed by something outside our control (or by us, before
     *    this stats call was taken).
     *  - `fresh`   — entry exists and mtime + size match. Safe to assume
     *    the bytes are what we last saw.
     *
     * Note: mtime + size is a best-effort fingerprint, not a hash. A file
     * rewritten with identical mtime *and* identical size will read as
     * `fresh`. In practice the Edit path catches this via the
     * `0 occurrences` failure mode, which prompts the model to re-read.
     */
    check(stats) {
        if (!FileReadCache.hasVerifiableIdentity(stats)) {
            return { state: 'unverifiable' };
        }
        const entry = this.byInode.get(FileReadCache.inodeKey(stats));
        if (!entry)
            return { state: 'unknown' };
        if (entry.mtimeMs !== stats.mtimeMs || entry.sizeBytes !== stats.size) {
            return { state: 'stale', entry };
        }
        return { state: 'fresh', entry };
    }
    /**
     * Mark the entry for `stats` as no longer quotable from conversation
     * history — its read/edit/write output was blanked by idle
     * microcompaction.
     *
     * Surgical alternative to {@link clear} for microcompaction: only
     * {@link FileReadEntry.readResidentInHistory} is disarmed; the
     * fingerprint / `lastReadAt` / `lastReadCacheable` that
     * read-before-write depends on are preserved (that is the issue
     * #4239 fix).
     *
     * Returns `true` if a matching entry was found and disarmed; `false`
     * if there is no entry for `stats` (never tracked, or `stats`
     * resolved to a different inode than recorded — file replaced /
     * symlink retargeted since the read). A `false` can still leave a
     * stale entry armed, so callers that know the original path should
     * fall back to {@link invalidateByPath}; callers without a path must
     * fall back to {@link clear}.
     */
    markReadEvictedFromHistory(stats) {
        if (!FileReadCache.hasVerifiableIdentity(stats)) {
            return false;
        }
        const entry = this.byInode.get(FileReadCache.inodeKey(stats));
        if (entry) {
            entry.readResidentInHistory = false;
            return true;
        }
        return false;
    }
    /** Remove the entry for the given Stats, if any. */
    invalidate(stats) {
        if (!FileReadCache.hasVerifiableIdentity(stats)) {
            return;
        }
        this.byInode.delete(FileReadCache.inodeKey(stats));
    }
    /**
     * Best-effort targeted fallback when a caller cannot resolve a path to the
     * inode it previously read (for example the file was deleted or replaced).
     * Prefer {@link invalidate} / {@link markReadEvictedFromHistory} when Stats
     * are available; this only matches the last observed path string.
     *
     * @returns true when at least one entry was removed.
     */
    invalidateByPath(absPath) {
        const target = resolvePath(absPath);
        let removed = false;
        for (const [key, entry] of this.byInode) {
            if (entry.realPath === absPath ||
                resolvePath(entry.realPath) === target) {
                this.byInode.delete(key);
                removed = true;
            }
        }
        return removed;
    }
    /** Drop every entry. Used by tests and on Config shutdown. */
    clear() {
        this.byInode.clear();
    }
    /**
     * Evict entries whose most recent Read (or Write; both set
     * {@link FileReadEntry.lastReadAt}) is older than `minutes`.
     *
     * This is a memory-pressure-driven eviction: it targets entries the
     * model is least likely to need again, trading cache hit rate for lower
     * memory footprint. Unlike {@link clear}, it preserves recently-read
     * entries so the file_unchanged fast-path stays available for active
     * files.
     *
     * @returns Number of entries evicted.
     */
    evictNotAccessedSince(minutes) {
        if (!Number.isFinite(minutes) || minutes < 1) {
            return 0;
        }
        const cutoff = Date.now() - minutes * 60 * 1000;
        let evicted = 0;
        for (const [key, entry] of this.byInode) {
            if (entry.lastReadAt !== undefined && entry.lastReadAt < cutoff) {
                this.byInode.delete(key);
                evicted++;
            }
        }
        return evicted;
    }
    /** Number of tracked entries. Diagnostic / test use only. */
    size() {
        return this.byInode.size;
    }
    upsert(absPath, stats) {
        const key = FileReadCache.inodeKey(stats);
        const existing = this.byInode.get(key);
        if (existing) {
            // Bump: move existing entry to the end of the FIFO queue so that
            // frequently-updated entries survive eviction.
            this.byInode.delete(key);
            existing.realPath = absPath;
            existing.mtimeMs = stats.mtimeMs;
            existing.sizeBytes = stats.size;
            this.byInode.set(key, existing);
            return existing;
        }
        // Evict oldest entry when cache exceeds MAX_ENTRIES (FIFO)
        if (this.byInode.size >= FileReadCache.MAX_ENTRIES) {
            const oldestKey = this.byInode.keys().next().value;
            if (oldestKey) {
                this.byInode.delete(oldestKey);
            }
        }
        const entry = FileReadCache.createEntry(absPath, stats);
        this.byInode.set(key, entry);
        return entry;
    }
    static createEntry(absPath, stats) {
        return {
            inodeKey: FileReadCache.inodeKey(stats),
            realPath: absPath,
            mtimeMs: stats.mtimeMs,
            sizeBytes: stats.size,
            lastReadWasFull: false,
            lastReadCacheable: false,
            readResidentInHistory: false,
        };
    }
}
//# sourceMappingURL=fileReadCache.js.map