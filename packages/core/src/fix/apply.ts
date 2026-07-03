import type { FsProvider } from "../fs-provider.js";
import type { ApplyFixResult, FixPlan } from "./types.js";

export interface ApplyFixContext {
  fs: FsProvider;
  /**
   * Caller-supplied timestamp string used to namespace the backup directory
   * (`.harness/backups/<timestamp>/`). Core NEVER calls Date.now() — the
   * caller (CLI/desktop) is responsible for generating this, so applyFix is
   * deterministic and safe to unit test.
   */
  timestamp: string;
}

/**
 * Execute a FixPlan: for every file the plan touches, write an
 * automatic pre-fix backup of its CURRENT content to
 * `.harness/backups/<timestamp>/<relPath>`, then write the plan's `after`
 * content.
 *
 * Backups are written before ANY mutation — the whole backup pass completes
 * first, then the whole write pass. If a file didn't exist before the fix
 * (operation === "create-file"), no backup is written for it (there is
 * nothing to back up).
 *
 * This function performs the plan verbatim: it does not recompute drift or
 * re-derive content. Byte-exact preservation outside marker regions is
 * guaranteed upstream by buildFixPlan (see plan.ts) — applyFix's job is
 * purely mechanical I/O.
 */
export async function applyFix(
  plan: FixPlan,
  ctx: ApplyFixContext,
): Promise<ApplyFixResult> {
  const { fs, timestamp } = ctx;
  const cwd = fs.cwd();
  const backupDir = fs.joinPath(".harness", "backups", timestamp);

  const backups: string[] = [];
  const written: string[] = [];

  // Pass 1: backups. Only for files that existed before the fix.
  for (const change of plan.changes) {
    if (change.operation === "create-file") continue;

    const backupRelPath = fs.joinPath(backupDir, change.path);
    const backupFullPath = fs.joinPath(cwd, backupRelPath);
    const backupParent = fs.dirname(backupFullPath);
    await fs.mkdir(backupParent, { recursive: true });
    await fs.writeFile(backupFullPath, change.before);
    backups.push(backupRelPath);
  }

  // Pass 2: writes. Happens only after every backup has succeeded.
  for (const change of plan.changes) {
    const fullPath = fs.joinPath(cwd, change.path);
    const dir = fs.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, change.after);
    written.push(change.path);
  }

  return {
    written,
    backupDir,
    backups,
  };
}
