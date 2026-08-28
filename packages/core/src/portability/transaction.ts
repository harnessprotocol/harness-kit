import type { FsProvider } from "../fs-provider.js";
import type { TransactionFileChange, TransactionResult } from "./types.js";

export interface TransactionContext {
  fs: FsProvider;
  timestamp: string;
  backupRoot?: string;
}

function assertRelativeSafePath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.startsWith("~") ||
    path.split(/[\\/]+/).some((part) => part === "..")
  ) {
    throw new Error(`transaction path must stay inside the project root: ${path}`);
  }
}

async function atomicWrite(fs: FsProvider, path: string, content: string, suffix: string): Promise<void> {
  const parent = fs.dirname(path);
  await fs.mkdir(parent, { recursive: true });
  const temporary = `${path}.harness-tmp-${suffix}`;
  await fs.writeFile(temporary, content);
  await fs.renameFile(temporary, path);
}

async function remove(fs: FsProvider, path: string): Promise<void> {
  if (!fs.removeFile) throw new Error("filesystem provider does not support transactional deletes");
  await fs.removeFile(path);
}

/**
 * Apply a complete file transaction. Every preimage is verified and backed up
 * before mutation; any failure restores all already-mutated paths in reverse.
 */
export async function applyFileTransaction(
  changes: TransactionFileChange[],
  context: TransactionContext,
): Promise<TransactionResult> {
  const { fs, timestamp } = context;
  const root = fs.cwd();
  const backupDir = fs.joinPath(context.backupRoot ?? ".harness/backups", timestamp);

  for (const change of changes) assertRelativeSafePath(change.path);
  const unique = new Set(changes.map((change) => change.path));
  if (unique.size !== changes.length) throw new Error("transaction contains duplicate file paths");

  // Verify stale plans before creating any backups or changing files.
  for (const change of changes) {
    const fullPath = fs.joinPath(root, change.path);
    const exists = await fs.exists(fullPath);
    if (change.before === null && exists) {
      throw new Error(`transaction precondition failed: ${change.path} now exists`);
    }
    if (change.before !== null) {
      if (!exists) throw new Error(`transaction precondition failed: ${change.path} was removed`);
      const actual = await fs.readFile(fullPath);
      if (actual !== change.before) {
        throw new Error(`transaction precondition failed: ${change.path} changed after preview`);
      }
    }
  }

  // Back up every existing preimage before the first mutation.
  for (const change of changes) {
    if (change.before === null) continue;
    const backupPath = fs.joinPath(root, backupDir, change.path);
    await atomicWrite(fs, backupPath, change.before, `${timestamp}-backup`);
  }

  const mutated: TransactionFileChange[] = [];
  const written: string[] = [];
  const removed: string[] = [];

  try {
    for (const [index, change] of changes.entries()) {
      const fullPath = fs.joinPath(root, change.path);
      if (change.after === null) {
        await remove(fs, fullPath);
        removed.push(change.path);
      } else {
        await atomicWrite(fs, fullPath, change.after, `${timestamp}-${index}`);
        written.push(change.path);
      }
      mutated.push(change);
    }
    return { committed: true, written, removed, rolledBack: [], backupDir };
  } catch (error) {
    const rolledBack: string[] = [];
    const rollbackErrors: string[] = [];
    for (const [index, change] of [...mutated].reverse().entries()) {
      const fullPath = fs.joinPath(root, change.path);
      try {
        if (change.before === null) {
          if (await fs.exists(fullPath)) await remove(fs, fullPath);
        } else {
          await atomicWrite(fs, fullPath, change.before, `${timestamp}-rollback-${index}`);
        }
        rolledBack.push(change.path);
      } catch (rollbackError) {
        rollbackErrors.push(
          `${change.path}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      committed: false,
      written,
      removed,
      rolledBack,
      backupDir,
      error: rollbackErrors.length ? `${message}; rollback failures: ${rollbackErrors.join("; ")}` : message,
    };
  }
}
