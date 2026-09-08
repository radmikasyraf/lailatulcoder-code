/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Extension } from '@lailatul-coder/lailatul-coder-core';
interface ExtensionListStepProps {
    extensions: Extension[];
    extensionsUpdateState: Map<string, string>;
    onExtensionSelect: (extensionIndex: number) => void;
}
export declare const ExtensionListStep: ({ extensions, extensionsUpdateState, onExtensionSelect, }: ExtensionListStepProps) => import("react").JSX.Element;
export {};
