import type { DaemonSessionTaskStatus } from '@lailatul-coder/sdk/daemon';

export function isComposerTask(task: DaemonSessionTaskStatus): boolean {
  return task.kind !== 'agent';
}
