import { Storage } from '@lailatul-coder/lailatul-coder-core';
import type { LoadedSettings } from '../config/settings.js';

export function runWithAcpRuntimeOutputDir<T>(
  settings: LoadedSettings,
  cwd: string,
  fn: () => T,
): T {
  return Storage.runWithRuntimeBaseDir(
    settings.merged.advanced?.runtimeOutputDir,
    cwd,
    fn,
  );
}
