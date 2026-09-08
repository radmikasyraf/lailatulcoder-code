const fs = require('fs');
const path = require('path');

// ── 1. Buat fail logoutCommand.js ──
const logoutCommand = `/**
 * @license
 * Copyright 2025 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { Storage } from '@lailatul-coder/lailatul-coder-core';
import * as fs from 'fs';
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
            const settingsPath = path.join(Storage.getGlobalLailatulcoderDir(), 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                // Clear auth-related settings
                delete settings.env;
                delete settings.model;
                delete settings.modelProviders;
                delete settings.providerMetadata;
                if (settings.security) {
                    delete settings.security.auth;
                }
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            }
            return {
                type: 'message',
                messageType: 'info',
                content: t('Successfully logged out. Run /auth to configure a new provider.'),
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
`;

fs.writeFileSync('packages/cli/dist/src/ui/commands/logoutCommand.js', logoutCommand, 'utf8');
console.log('Created logoutCommand.js');

// ── 2. Register dalam command registry ──
// Cari fail yang register semua commands
const files = fs.readdirSync('packages/cli/dist/src/ui/commands/');
console.log('Looking for registry file...');

// Biasanya dalam AppContainer.js atau index.js atau helpCommand.js
let registryContent = fs.readFileSync('packages/cli/dist/src/ui/commands/helpCommand.js', 'utf8');
if (registryContent.includes('authCommand')) {
    console.log('Found in helpCommand.js');
} else {
    console.log('Not in helpCommand.js, checking AppContainer...');
}
