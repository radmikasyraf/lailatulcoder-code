/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { listCommand } from './sessions/list.js';
import { psCommand } from './sessions/ps.js';
export const sessionsCommand = {
    command: 'sessions',
    describe: 'Manage LailatulCoder Ai sessions',
    builder: (yargs) => yargs
        .command(listCommand)
        .command(psCommand)
        .demandCommand(1, 'You need at least one command before continuing.')
        .version(false),
    // demandCommand(1) ensures a subcommand is always required;
    // yargs automatically shows help when none is provided.
    handler: () => { },
};
//# sourceMappingURL=sessions.js.map