/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { getTeamName, resolveActiveTeamName } from '../agents/team/identity.js';
import { sanitizeName } from '../agents/team/teamHelpers.js';
import { listTasks } from '../agents/team/tasks.js';
class TaskListInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        const filters = [];
        if (this.params.status) {
            filters.push(`status=${this.params.status}`);
        }
        if (this.params.owner) {
            filters.push(`owner=${this.params.owner}`);
        }
        if (this.params.blockedBy) {
            filters.push(`blockedBy=${this.params.blockedBy}`);
        }
        return filters.length > 0
            ? `List tasks (${filters.join(', ')})`
            : 'List all tasks';
    }
    async execute() {
        const teamName = resolveActiveTeamName(this.config.getTeamContext()?.teamName);
        if (!teamName) {
            const msg = 'No active team. Create a team first.';
            return {
                llmContent: msg,
                returnDisplay: msg,
                error: { message: msg },
            };
        }
        let ownerFilter;
        if (this.params.owner !== undefined) {
            ownerFilter = sanitizeName(this.params.owner);
            if (!ownerFilter) {
                const msg = 'Cannot filter by owner: owner must include at least one ' +
                    'letter, number, or hyphen.';
                return {
                    llmContent: msg,
                    returnDisplay: msg,
                    error: { message: msg },
                };
            }
        }
        const tasks = await listTasks(teamName, {
            status: this.params.status,
            owner: ownerFilter,
            blockedBy: this.params.blockedBy,
        });
        if (tasks.length === 0) {
            const llmContent = 'No tasks found.';
            return { llmContent, returnDisplay: llmContent };
        }
        const lines = tasks.map((t) => `#${t.id} [${t.status}]` +
            (t.owner ? ` @${t.owner}` : '') +
            ` — ${t.subject}`);
        // Include unread leader messages if called by the
        // leader (no teammate identity = leader context).
        const manager = this.config.getTeamManager();
        if (manager && !getTeamName()) {
            try {
                const msgs = await manager.getLeaderMessages();
                if (msgs.length > 0) {
                    lines.push('');
                    lines.push('--- Teammate messages ---');
                    // Run the same `<teammate_message>` envelope `pollLeaderInbox`
                    // uses (stable tag + structural escaping) so a teammate can't
                    // slip a forged `[leader]: ...` header into the leader's
                    // conversation through the `task_list` path.
                    for (const wrapped of manager.formatLeaderEnvelope(msgs)) {
                        lines.push(wrapped);
                    }
                }
            }
            catch {
                // Ignore — leader inbox may not exist.
            }
            // Hint to the leader: don't poll task_list repeatedly.
            if (manager.hasActiveTeammates()) {
                lines.push('');
                lines.push('NOTE: Teammates are still working. Their results' +
                    ' will be delivered as messages — do NOT call' +
                    ' task_list again to check. End your turn and' +
                    ' wait for teammate messages.');
            }
        }
        const llmContent = lines.join('\n');
        const display = {
            type: 'task_list',
            tasks: tasks.map((t) => ({
                id: t.id,
                subject: t.subject,
                status: t.status,
                owner: t.owner,
            })),
        };
        return { llmContent, returnDisplay: display };
    }
}
export class TaskListTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.TASK_LIST;
    constructor(config) {
        super(TaskListTool.Name, ToolDisplayNames.TASK_LIST, 'List tasks in the team task list. ' +
            'All filter parameters are optional.', Kind.Read, {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'completed'],
                    description: 'Filter by task status.',
                },
                owner: {
                    type: 'string',
                    description: 'Filter by owner agent name.',
                },
                blockedBy: {
                    type: 'string',
                    description: 'Filter for tasks blocked by this task ID.',
                },
            },
            additionalProperties: false,
        });
        this.config = config;
    }
    createInvocation(params) {
        return new TaskListInvocation(this.config, params);
    }
}
//# sourceMappingURL=task-list.js.map