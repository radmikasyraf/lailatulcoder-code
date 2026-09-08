/**
 * cron_list tool — lists all active cron jobs (in-session and durable).
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { humanReadableCron } from '../utils/cronDisplay.js';
import { CRON_TASKS_DISPLAY_PATH, readCronTasks, taskHasLegacyCondition, } from '../services/cronTasksFile.js';
function truncatePrompt(prompt) {
    return prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt;
}
function displaySchedule(cron, fireAtMs) {
    if (cron === '@wakeup' && fireAtMs !== undefined) {
        return `wakeup at ${new Date(fireAtMs).toISOString()}`;
    }
    return humanReadableCron(cron);
}
class CronListInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return '';
    }
    async execute() {
        // File-first: durable jobs come straight from the durable tasks file
        // so management works in every mode — headless included — regardless
        // of what the scheduler has loaded.
        // The scheduler contributes only this process's session-only jobs.
        const scheduler = this.config.getCronScheduler();
        // readCronTasks maps a missing file to [] internally, so anything
        // thrown here is a real failure (corrupted file, permissions).
        // Surface it instead of presenting durable jobs as absent.
        let fileTasks;
        try {
            fileTasks = await readCronTasks(this.config.getProjectRoot());
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error listing cron jobs: ${message}`,
                returnDisplay: message,
                error: { message },
            };
        }
        const jobs = [
            ...fileTasks.map((task) => ({
                id: task.id,
                cron: task.cron,
                prompt: task.prompt,
                recurring: task.recurring,
                durable: true,
                ...(task.name ? { name: task.name } : {}),
                // A legacy guarded task (removed isolated mode + precondition) can never
                // fire — the scheduler skips it — so report it disabled here too rather
                // than as an enabled task that silently never runs.
                enabled: task.enabled !== false && !taskHasLegacyCondition(task),
            })),
            ...scheduler
                .list()
                .filter((job) => !job.durable)
                .map((job) => ({
                id: job.id,
                cron: job.cronExpr,
                prompt: job.prompt,
                recurring: job.recurring,
                durable: false,
                fireAtMs: job.fireAtMs,
            })),
        ];
        if (jobs.length === 0) {
            const result = 'No active cron jobs or loop wakeups.';
            return { llmContent: result, returnDisplay: result };
        }
        const llmLines = jobs.map((job) => {
            const type = job.recurring ? 'recurring' : 'one-shot';
            const durability = job.durable ? 'durable' : 'session-only';
            // A disabled durable task stays on disk but never fires — mark it so the
            // agent doesn't assume it is active.
            const status = job.enabled === false ? ', disabled' : '';
            const schedule = job.cron === '@wakeup'
                ? displaySchedule(job.cron, job.fireAtMs)
                : job.cron;
            const prompt = job.cron === '@wakeup' ? truncatePrompt(job.prompt) : job.prompt;
            const label = job.name ? `${job.name}: ` : '';
            return `${job.id} — ${schedule} (${type}) [${durability}${status}]: ${label}${prompt}`;
        });
        const llmContent = llmLines.join('\n');
        const displayLines = jobs.map((job) => `${job.id} ${displaySchedule(job.cron, job.fireAtMs)} [${job.durable ? 'durable' : 'session-only'}${job.enabled === false ? ', disabled' : ''}]${job.name ? `: ${job.name}` : ''}`);
        const returnDisplay = displayLines.join('\n');
        return { llmContent, returnDisplay };
    }
}
export class CronListTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.CRON_LIST;
    constructor(config) {
        super(CronListTool.Name, ToolDisplayNames.CRON_LIST, 'List all cron jobs scheduled via CronCreate (session-only, or ' +
            `durable under ${CRON_TASKS_DISPLAY_PATH}) and pending loop wakeups ` +
            'scheduled via LoopWakeup (always session-only).', Kind.Other, {
            type: 'object',
            properties: {},
            additionalProperties: false,
        }, true, // isOutputMarkdown
        false, // canUpdateOutput
        true, // shouldDefer — low-frequency inspection tool
        false, // alwaysLoad
        'cron list show active scheduled tasks loop jobs wakeups');
        this.config = config;
    }
    createInvocation(params) {
        return new CronListInvocation(this.config, params);
    }
}
//# sourceMappingURL=cron-list.js.map