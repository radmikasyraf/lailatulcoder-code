/**
 * @license
 * Copyright 2026 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { createDebugLogger } from '@lailatul-coder/lailatul-coder-core';
const debugLogger = createDebugLogger('HOOKS_UI');
export const hooksCommand = {
    command: 'hooks',
    aliases: ['hook'],
    describe: 'Manage LailatulCoder Ai hooks (use /hooks in interactive mode).',
    builder: (yargs) => yargs.version(false).help(false),
    handler: () => {
        // In CLI mode, this command is not interactive.
        // Users should use /hooks in interactive mode for the full UI experience.
        debugLogger.debug('Use /hooks in interactive mode to manage hooks with the UI.');
        process.exit(0);
    },
};
//# sourceMappingURL=hooks.js.map