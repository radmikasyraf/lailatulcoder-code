/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BridgeEvent } from '@lailatul-coder/acp-bridge/eventBus';
/**
 * `available_commands_update` snapshots embed every installed skill's full
 * SKILL.md body under `update._meta.availableSkillDetails` for ACP clients
 * that display or edit skill files (e.g. desktop). The SDK/browser surface
 * (SSE streams and REST responses) only reads the command entries and the
 * `availableSkills` name list, so with many skills installed the bodies are
 * hundreds of kilobytes of dead weight that every browser tab parses and
 * discards on each snapshot (#9234). The `/acp` surface keeps delivering the
 * full snapshot; apply this at every SDK/browser egress point. Frames are
 * shared with other bus subscribers, so reshape immutably instead of
 * mutating.
 */
export declare function omitSkillDetailsForSdkSurface<T extends {
    type: string;
    data: unknown;
}>(event: T): T;
/**
 * `POST /session/:id/load` embeds the replay snapshot (compacted turns plus
 * the in-flight journal) directly in the response body; apply the same
 * redaction to those frames as the SSE egress does.
 */
export declare function omitSkillDetailsFromReplayArrays<T extends {
    compactedReplay?: BridgeEvent[];
    liveJournal?: BridgeEvent[];
}>(session: T): T;
