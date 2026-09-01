import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  createHomeTransactionRoot,
  readPortabilityState,
  rollbackFileTransaction,
} from "@harness-kit/core";
import type { TransactionManifest, TransactionRecord } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { defaultStatePath, SqliteStateStore } from "../state/sqlite-store.js";
import { readOptional, timestamp } from "./portability-common.js";

interface RollbackFlags {
  transaction?: string;
  list?: boolean;
  yes?: boolean;
  json?: boolean;
}

/** Ledger lookup that degrades to the project-local state.json path (AC-33). */
interface LedgerRead {
  records: TransactionRecord[];
  /** Present when the ledger was unreadable — the caller must say so. */
  degraded?: string;
}

async function readLedger(limit?: number): Promise<LedgerRead> {
  let store: SqliteStateStore | undefined;
  try {
    store = await SqliteStateStore.open(defaultStatePath());
    return { records: await store.listTransactions(limit) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { records: [], degraded: message.split("\n")[0] };
  } finally {
    try {
      await store?.close();
    } catch {
      // The handle is already unusable; nothing left to release.
    }
  }
}

/**
 * Default cap on `--list`. The ledger is never pruned, so an unbounded read
 * materializes every row ever recorded — the `limit` parameter was plumbed
 * all the way through and then never used on the one path that needs it.
 */
const DEFAULT_LIST_LIMIT = 50;

async function listRollbackPoints(flags: RollbackFlags): Promise<void> {
  const { records, degraded } = await readLedger(DEFAULT_LIST_LIMIT);
  const root = resolve(".");
  // With no usable ledger there is still one recoverable point: the project's
  // own last-known-good. Report it, and say why the list is short.
  let fallback: string | null = null;
  if (degraded || records.length === 0) {
    const stateContent = await readOptional(resolve(root, ".harness/state.json"));
    try {
      fallback = stateContent ? (readPortabilityState(stateContent).lastKnownGood ?? null) : null;
    } catch {
      // Listing rollback points must never fail on unreadable state — the
      // ledger entries above are still worth showing.
      fallback = null;
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({ transactions: records, fallback, degraded: degraded ?? null }, null, 2));
    return;
  }

  if (degraded) {
    console.log(`Rollback ledger unavailable (${degraded}); showing project state only.`);
  }
  if (records.length === 0 && !fallback) {
    console.log("No rollback points recorded.");
    return;
  }
  for (const record of records) {
    console.log(
      `  ${record.appliedAt}  ${record.transactionId}  [${record.roots.join("+")}]  ${record.surfaces.join(", ")}`,
    );
  }
  if (records.length === DEFAULT_LIST_LIMIT) {
    console.log(`  … showing the most recent ${DEFAULT_LIST_LIMIT}.`);
  }
  if (fallback) console.log(`  (project last-known-good) ${fallback}`);
}

export async function rollbackCommand(flags: RollbackFlags): Promise<void> {
  if (flags.list) {
    await listRollbackPoints(flags);
    return;
  }

  const root = resolve(".");
  const home = homedir();
  let transaction = flags.transaction;
  let manifestRoot = root;

  // A bare id resolves through the ledger, which knows which root anchors it;
  // an explicit path stays project-relative, as it was before the ledger.
  if (transaction && !transaction.includes("/")) {
    const { records } = await readLedger();
    const match = records.find((record) => record.transactionId === transaction);
    if (!match) throw new Error(`no recorded transaction with id: ${transaction}`);
    transaction = match.manifestPath;
    manifestRoot = match.manifestRoot;
  }

  if (!transaction) {
    const stateContent = await readOptional(resolve(root, ".harness/state.json"));
    if (!stateContent) throw new Error("no portability state or transaction was provided");
    transaction = readPortabilityState(stateContent).lastKnownGood;
  }
  if (!transaction) throw new Error("no last-known-good transaction is available");

  const manifestPath = resolve(manifestRoot, transaction);
  const manifestContent = await readOptional(manifestPath);
  if (!manifestContent) throw new Error(`transaction manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(manifestContent) as TransactionManifest;
  const preview = {
    transaction: manifestPath,
    status: manifest.status,
    files: manifest.changes.map((change) => ({
      path: change.path,
      root: change.root ?? "project",
      action: change.before === null ? "remove" : "restore",
    })),
    approvalRequired: !flags.yes,
  };
  if (flags.json) console.log(JSON.stringify(preview, null, 2));
  else {
    console.log(`Rollback preview: ${preview.files.length} file(s) from ${manifest.timestamp}.`);
    for (const file of preview.files) {
      console.log(`  ${file.action.padEnd(7)} ${file.root.padEnd(7)} ${file.path}`);
    }
    if (!flags.yes) console.log("Preview only. Re-run with --yes to restore this transaction.");
  }
  if (!flags.yes) return;
  const result = await rollbackFileTransaction(manifest, {
    fs: new NodeFsProvider(root),
    timestamp: timestamp(),
    roots: { home: createHomeTransactionRoot(home, process.platform as "darwin" | "linux" | "win32") },
  });
  if (!result.committed) throw new Error(result.error ?? "rollback transaction failed");
  if (!flags.json) console.log(`Rollback complete. Recovery transaction: ${result.manifestPath}`);
}
