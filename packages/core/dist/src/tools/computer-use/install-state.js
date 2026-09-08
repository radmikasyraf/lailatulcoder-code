/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
/**
 * Path to the install-state file. Exported for tests so they can
 * point at a temp directory.
 */
export function installStatePathFor(home = homedir()) {
    return join(home, '.lailatulcoder', 'computer-use', 'installed.json');
}
export async function loadInstallState(home = homedir()) {
    try {
        const text = await readFile(installStatePathFor(home), 'utf8');
        const parsed = JSON.parse(text);
        // Minimal shape check — older or malformed files act as "not approved".
        if (typeof parsed?.approvedPackageSpec !== 'string')
            return undefined;
        if (typeof parsed?.approvedAtIso !== 'string')
            return undefined;
        return parsed;
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return undefined;
        // Treat unreadable / malformed state as "not approved" — re-prompt
        // is safe; treating a bad file as approved would silently install.
        return undefined;
    }
}
export async function saveInstallState(home = homedir(), state) {
    const path = installStatePathFor(home);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}
/**
 * True iff the persisted state's package spec exactly matches the one
 * we're about to install. Different specs (version pin bumps) require
 * re-approval, since the user may have approved an older / smaller /
 * different-license version.
 */
export async function isPackageSpecApproved(home = homedir(), packageSpec) {
    const state = await loadInstallState(home);
    return state?.approvedPackageSpec === packageSpec;
}
//# sourceMappingURL=install-state.js.map