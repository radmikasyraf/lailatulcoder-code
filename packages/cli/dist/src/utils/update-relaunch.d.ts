/**
 * @license
 * Copyright 2026 LailatulCoder Ai
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LoadedSettings } from '../config/settings.js';
export declare function updateBeforeRelaunch(settings: LoadedSettings, projectRoot: string, relaunchOnFailure: boolean): Promise<boolean>;
