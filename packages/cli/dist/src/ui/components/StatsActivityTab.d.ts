/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import type { StatsData } from '../utils/statsDataService.js';
import type { TimeRange } from '@lailatul-coder/lailatul-coder-core';
export declare const ActivityTab: React.FC<{
    data: StatsData;
    bodyWidth: number;
    chartMonthOffset: number;
    range: TimeRange;
}>;
