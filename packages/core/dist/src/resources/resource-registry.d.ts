/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { DiscoveredMCPResource } from '../tools/mcp-client.js';
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
export declare class ResourceRegistry {
    private resources;
    private key;
    /**
     * Registers (or replaces) a resource definition. Re-discovery of the
     * same `(serverName, uri)` overwrites the prior entry so a server that
     * mutates a resource's metadata propagates correctly.
     */
    registerResource(resource: DiscoveredMCPResource): void;
    /**
     * Returns all registered resources, sorted by server then URI.
     */
    getAllResources(): DiscoveredMCPResource[];
    /**
     * Returns the resources registered from a specific MCP server.
     */
    getResourcesByServer(serverName: string): DiscoveredMCPResource[];
    /**
     * Look up a single resource by its `(serverName, uri)` identity.
     */
    getResource(serverName: string, uri: string): DiscoveredMCPResource | undefined;
    /**
     * Clears all resources from the registry.
     */
    clear(): void;
    /**
     * Removes all resources from a specific server.
     */
    removeResourcesByServer(serverName: string): void;
}
