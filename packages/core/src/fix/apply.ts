import type { FsProvider } from "../fs-provider.js";
import { applyFileTransaction } from "../portability/transaction.js";
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

/** Apply legacy drift repairs through the shared transactional engine. */
export async function applyFix(
  plan: FixPlan,
  ctx: ApplyFixContext,
): Promise<ApplyFixResult> {
  const result = await applyFileTransaction(
    plan.changes.map((change) => ({
      path: change.path,
      before: change.operation === "create-file" ? null : change.before,
      after: change.after,
    })),
    ctx,
  );
  if (!result.committed) throw new Error(result.error ?? "fix transaction failed");
  return {
    written: result.written,
    backupDir: result.backupDir,
    backups: plan.changes
      .filter((change) => change.operation !== "create-file")
      .map((change) => ctx.fs.joinPath(result.backupDir, change.path)),
    manifestPath: result.manifestPath,
  };
}
