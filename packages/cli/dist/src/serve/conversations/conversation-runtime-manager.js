/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { ConversationRuntimeOwnershipError, conversationRootCompromisedError, conversationRuntimeUnavailableError, } from './conversation-runtime-errors.js';
export class ConversationRuntimeManager {
    options;
    runtime;
    pending;
    constructor(options) {
        this.options = options;
    }
    ensure() {
        if (this.pending)
            return this.pending;
        const pending = this.ensureOnce().finally(() => {
            if (this.pending === pending)
                this.pending = undefined;
        });
        this.pending = pending;
        return pending;
    }
    async ensureOnce() {
        await this.options.ownership.acquire();
        const root = await this.revalidateRoot();
        if (this.runtime) {
            await this.assertExactRoot(this.runtime.workspaceCwd);
            this.assertActiveRuntime(root.canonicalRoot, this.runtime);
            return this.runtime;
        }
        const entry = this.options.registry.getManagedEntryByWorkspaceCwd(root.canonicalRoot);
        if (entry) {
            const existing = entry.current?.runtime;
            if (entry.state !== 'active' || !existing) {
                throw conversationRuntimeUnavailableError();
            }
            this.assertOwnedRuntime(existing);
            await this.assertExactRoot(existing.workspaceCwd);
            this.assertActiveRuntime(root.canonicalRoot, existing);
            this.runtime = existing;
            return existing;
        }
        let created;
        try {
            created = await this.options.publishRuntime(root.canonicalRoot, async (candidate) => {
                await this.assertExactRoot(candidate.workspaceCwd);
                this.assertOwnedRuntime(candidate);
            });
        }
        catch (error) {
            if (error instanceof ConversationRuntimeOwnershipError)
                throw error;
            throw conversationRuntimeUnavailableError(error);
        }
        this.assertActiveRuntime(root.canonicalRoot, created);
        this.runtime = created;
        return created;
    }
    async revalidateRoot() {
        try {
            return await this.options.workspace.revalidate();
        }
        catch (error) {
            throw conversationRootCompromisedError(error);
        }
    }
    async assertExactRoot(candidate) {
        try {
            await this.options.workspace.assertExactRoot(candidate);
        }
        catch (error) {
            throw conversationRootCompromisedError(error);
        }
    }
    assertActiveRuntime(canonicalRoot, runtime) {
        this.assertOwnedRuntime(runtime);
        const entry = this.options.registry.getManagedEntryByWorkspaceCwd(canonicalRoot);
        if (entry?.state !== 'active' || entry.current?.runtime !== runtime) {
            throw conversationRuntimeUnavailableError();
        }
    }
    assertOwnedRuntime(runtime) {
        if (runtime.primary ||
            runtime.provenance !== 'live-conversation' ||
            !runtime.trusted ||
            runtime.removable !== false) {
            throw conversationRootCompromisedError();
        }
    }
}
//# sourceMappingURL=conversation-runtime-manager.js.map