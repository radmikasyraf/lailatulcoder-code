/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createDebugLogger } from '../utils/debugLogger.js';
const debugLogger = createDebugLogger('RESOURCE_REGISTRY');
/**
 * Registry of resources discovered from MCP servers (`resources/list`).
 *
 * Mirrors `PromptRegistry` but keys entries by the `(serverName, uri)`
 * pair rather than by a bare name. A resource's identity is its URI
 * within a given server, and the read path (`ToolRegistry.readMcpResource`
 * → `McpClientManager.readResource`) is addressed by `(serverName, uri)`,
 * so two servers advertising the same URI must not collide. This differs
 * from `PromptRegistry`'s rename-on-collision strategy, which exists only
 * because prompts surface as uniquely-named slash commands.
 */
export class ResourceRegistry {
    resources = new Map();
    key(serverName, uri) {
        // Join with an explicit NUL separator. A valid URI cannot contain a
        // raw NUL (RFC 3986), and server names (settings.json object keys)
        // effectively never do, so the composite key is collision-proof. A
        // printable separator such as a space would be unsafe: server names
        // are user-defined and may contain spaces, which could let
        // `"a b" + uri` collide with `"a" + "b uri"`.
        return `${serverName}\u0000${uri}`;
    }
    /**
     * Registers (or replaces) a resource definition. Re-discovery of the
     * same `(serverName, uri)` overwrites the prior entry so a server that
     * mutates a resource's metadata propagates correctly.
     */
    registerResource(resource) {
        const key = this.key(resource.serverName, resource.uri);
        if (this.resources.has(key)) {
            debugLogger.debug(`Resource "${resource.uri}" from "${resource.serverName}" already registered. Overwriting.`);
        }
        this.resources.set(key, resource);
    }
    /**
     * Returns all registered resources, sorted by server then URI.
     */
    getAllResources() {
        return Array.from(this.resources.values()).sort((a, b) => a.serverName.localeCompare(b.serverName) || a.uri.localeCompare(b.uri));
    }
    /**
     * Returns the resources registered from a specific MCP server.
     */
    getResourcesByServer(serverName) {
        const serverResources = [];
        for (const resource of this.resources.values()) {
            if (resource.serverName === serverName) {
                serverResources.push(resource);
            }
        }
        return serverResources.sort((a, b) => a.uri.localeCompare(b.uri));
    }
    /**
     * Look up a single resource by its `(serverName, uri)` identity.
     */
    getResource(serverName, uri) {
        return this.resources.get(this.key(serverName, uri));
    }
    /**
     * Clears all resources from the registry.
     */
    clear() {
        this.resources.clear();
    }
    /**
     * Removes all resources from a specific server.
     */
    removeResourcesByServer(serverName) {
        for (const [key, resource] of this.resources.entries()) {
            if (resource.serverName === serverName) {
                this.resources.delete(key);
            }
        }
    }
}
//# sourceMappingURL=resource-registry.js.map