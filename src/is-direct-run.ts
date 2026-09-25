import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// realpathSync resolves symlinks so a symlinked bin still matches the
// module's real file URL; guarded because argv[1] may be undefined and
// realpathSync throws on a nonexistent path.
export function isDirectRun(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }

  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}
