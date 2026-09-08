/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const preparationsByResponse = new WeakMap();
export function setToolCallPreparations(response, preparations) {
    preparationsByResponse.set(response, preparations);
}
export function getToolCallPreparations(response) {
    return preparationsByResponse.get(response) ?? [];
}
//# sourceMappingURL=tool-call-preparation.js.map