import type { FsProvider } from "../fs-provider.js";
import type {
  TransactionFileChange,
  TransactionManifest,
  TransactionResult,
  TransactionRootId,
} from "./types.js";

/** Where a named root lives, and (optionally) what may be written inside it. */
export interface TransactionRoot {
  absolutePath: string;
}

export interface TransactionContext {
  fs: FsProvider;
  timestamp: string;
  backupRoot?: string;
  /**
   * Named roots this transaction may touch. "project" defaults to `fs.cwd()`;
   * "home" has no default — a home-rooted change without a configured home
   * root is refused, so a caller cannot reach the user's config by accident.
   */
  roots?: Partial<Record<TransactionRootId, TransactionRoot>>;
}

/** Changes are keyed by (root, path): the same relative path in two roots is
 *  two distinct files, not a duplicate. */
function changeKey(change: TransactionFileChange): string {
  return `${change.root ?? "project"}\u0000${change.path}`;
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

async function assertNoSymlinkBoundary(fs: FsProvider, root: string, path: string): Promise<void> {
  if (!fs.isSymlink) return;
  const parts = path.split(/[\\/]+/).filter(Boolean);
  for (let index = 1; index <= parts.length; index += 1) {
    const candidate = fs.joinPath(root, ...parts.slice(0, index));
    if (await fs.isSymlink(candidate)) {
      throw new Error(`transaction path crosses a symbolic link: ${parts.slice(0, index).join("/")}`);
    }
  }
}

async function atomicWrite(fs: FsProvider, path: string, content: string, suffix: string, mode?: number): Promise<void> {
  const parent = fs.dirname(path);
  await fs.mkdir(parent, { recursive: true });
  const temporary = `${path}.harness-tmp-${suffix}`;
  await fs.writeFile(temporary, content);
  if (mode !== undefined && fs.setFileMode) await fs.setFileMode(temporary, mode);
  await fs.renameFile(temporary, path);
}

async function remove(fs: FsProvider, path: string): Promise<void> {
  if (!fs.removeFile) throw new Error("filesystem provider does not support transactional deletes");
  await fs.removeFile(path);
}

async function writeManifest(
  fs: FsProvider,
  root: string,
  manifestPath: string,
  manifest: TransactionManifest,
): Promise<void> {
  await atomicWrite(fs, fs.joinPath(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, `${manifest.timestamp}-manifest`, 0o600);
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
  const roots: Partial<Record<TransactionRootId, string>> = {
    project: context.roots?.project?.absolutePath ?? fs.cwd(),
    ...(context.roots?.home ? { home: context.roots.home.absolutePath } : {}),
  };
  const rootOf = (change: TransactionFileChange): string => {
    const id = change.root ?? "project";
    const absolute = roots[id];
    if (!absolute) {
      throw new Error(
        `transaction targets the "${id}" root, which this context does not configure`,
      );
    }
    return absolute;
  };

  const backupDir = fs.joinPath(context.backupRoot ?? ".harness/backups", timestamp);
  // Backups and the manifest live in the root they describe. A mixed
  // transaction anchors its manifest in the project root; a pure user-scope
  // one has no project to write into, so it anchors in the home root.
  const manifestRootId: TransactionRootId =
    changes.length === 0 || changes.some((change) => (change.root ?? "project") === "project")
      ? "project"
      : "home";
  const manifestRoot = rootOf({ root: manifestRootId } as TransactionFileChange);
  const manifestPath = fs.joinPath(backupDir, "transaction.json");

  for (const change of changes) {
    assertRelativeSafePath(change.path);
    rootOf(change);
  }
  assertRelativeSafePath(backupDir);
  const unique = new Set(changes.map(changeKey));
  if (unique.size !== changes.length) throw new Error("transaction contains duplicate file paths");

  await assertNoSymlinkBoundary(fs, manifestRoot, backupDir);
  for (const change of changes) await assertNoSymlinkBoundary(fs, rootOf(change), change.path);

  // Verify stale plans before creating any backups or changing files.
  const originalModes = new Map<string, number>();
  for (const change of changes) {
    const fullPath = fs.joinPath(rootOf(change), change.path);
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
      const mode = await fs.getFileMode?.(fullPath);
      if (mode !== null && mode !== undefined) originalModes.set(changeKey(change), mode);
    }
  }

  // Back up every existing preimage before the first mutation.
  for (const change of changes) {
    if (change.before === null) continue;
    const backupPath = fs.joinPath(rootOf(change), backupDir, change.path);
    await atomicWrite(fs, backupPath, change.before, `${timestamp}-backup`, 0o600);
  }

  const manifest: TransactionManifest = {
    version: changes.some((change) => change.root !== undefined) ? 2 : 1,
    timestamp,
    status: "prepared",
    changes,
  };
  await writeManifest(fs, manifestRoot, manifestPath, manifest);

  const mutated: TransactionFileChange[] = [];
  const written: string[] = [];
  const removed: string[] = [];

  try {
    for (const [index, change] of changes.entries()) {
      const fullPath = fs.joinPath(rootOf(change), change.path);
      if (change.after === null) {
        await remove(fs, fullPath);
        removed.push(change.path);
      } else {
        await atomicWrite(fs, fullPath, change.after, `${timestamp}-${index}`, originalModes.get(changeKey(change)));
        written.push(change.path);
      }
      mutated.push(change);
    }
    manifest.status = "committed";
    await writeManifest(fs, manifestRoot, manifestPath, manifest);
    return { committed: true, written, removed, rolledBack: [], backupDir, manifestPath };
  } catch (error) {
    const rolledBack: string[] = [];
    const rollbackErrors: string[] = [];
    for (const [index, change] of [...mutated].reverse().entries()) {
      const fullPath = fs.joinPath(rootOf(change), change.path);
      try {
        if (change.before === null) {
          if (await fs.exists(fullPath)) await remove(fs, fullPath);
        } else {
          await atomicWrite(fs, fullPath, change.before, `${timestamp}-rollback-${index}`, originalModes.get(changeKey(change)));
        }
        rolledBack.push(change.path);
      } catch (rollbackError) {
        rollbackErrors.push(
          `${change.path}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    manifest.status = rollbackErrors.length === 0 ? "rolled-back" : "rollback-failed";
    manifest.error = rollbackErrors.length ? `${message}; rollback failures: ${rollbackErrors.join("; ")}` : message;
    try {
      await writeManifest(fs, manifestRoot, manifestPath, manifest);
    } catch (manifestError) {
      rollbackErrors.push(
        `manifest: ${manifestError instanceof Error ? manifestError.message : String(manifestError)}`,
      );
    }
    return {
      committed: false,
      written,
      removed,
      rolledBack,
      backupDir,
      manifestPath,
      error: rollbackErrors.length ? `${message}; rollback failures: ${rollbackErrors.join("; ")}` : message,
    };
  }
}

/** Restore a previously committed transaction without overwriting later edits. */
export async function rollbackFileTransaction(
  manifest: TransactionManifest,
  context: TransactionContext,
): Promise<TransactionResult> {
  if ((manifest.version !== 1 && manifest.version !== 2) || manifest.status !== "committed") {
    throw new Error("only committed transaction manifests can be rolled back");
  }

  // v1 manifests predate named roots: every change was project-rooted, and
  // omitting `root` here preserves that meaning exactly.
  const reverseChanges = manifest.changes.map((change) => ({
    ...(change.root ? { root: change.root } : {}),
    path: change.path,
    before: change.after,
    after: change.before,
  }));
  return applyFileTransaction(reverseChanges, context);
}
