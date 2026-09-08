/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { Storage } from '@lailatul-coder/lailatul-coder-core';
import * as fsModule from 'fs';
import * as path from 'path';
export const logoutCommand = {
    name: 'logout',
    altNames: ['disconnect', 'signout'],
    get description() {
        return t('Logout and clear API key');
    },
    kind: CommandKind.BUILT_IN,
    supportedModes: ['interactive', 'non_interactive', 'acp'],
    action: (context, _args) => {
        try {
            const settingsPath = path.join(Storage.getGlobalQwenDir(), 'settings.json');
            if (fsModule.existsSync(settingsPath)) {
                const settings = JSON.parse(fsModule.readFileSync(settingsPath, 'utf8'));
                delete settings.env;
                delete settings.model;
                delete settings.modelProviders;
                delete settings.providerMetadata;
                if (settings.security) {
                    delete settings.security.auth;
                }
                fsModule.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            }
            const now = Date.now();
            return {
                type: 'quit',
                messages: [
                    {
                        type: 'user',
                        text: '/logout',
                        id: now - 1,
                    },
                    {
                        type: 'quit',
                        duration: '0s',
                        id: now,
                    },
                ],
            };
        } catch (e) {
            return {
                type: 'message',
                messageType: 'error',
                content: t('Failed to logout: {{error}}', { error: e.message }),
            };
        }
    },
};
//# sourceMappingURL=logoutCommand.js.map
