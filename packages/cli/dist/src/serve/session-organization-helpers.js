/**
 * @license
 * Copyright 2025 LailatulCoder Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { SessionOrganizationService } from '@lailatul-coder/lailatul-coder-core';
import { writeStderrLine } from '../utils/stdioHelpers.js';
export function createSessionOrganizationService(workspaceCwd) {
    return new SessionOrganizationService(workspaceCwd, (message) => {
        writeStderrLine(`LailatulCoder serve: session-org: ${message}`);
    });
}
//# sourceMappingURL=session-organization-helpers.js.map