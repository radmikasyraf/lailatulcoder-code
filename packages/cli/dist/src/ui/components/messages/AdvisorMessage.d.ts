/**
 * @license
 * Copyright 2025 Qwen Code
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
export interface AdvisorDisplayProps {
    /** The reviewer's markdown review. */
    text: string;
    /** Resolved model id that produced the review; shown in the header. */
    model: string;
    /** Width of the parent container. Falls back to terminal width. */
    containerWidth?: number;
}
export declare const AdvisorMessage: React.NamedExoticComponent<AdvisorDisplayProps>;
