import { resolve } from "node:path";
import {
  readPortabilityState,
  rollbackFileTransaction,
} from "@harness-kit/core";
import type { TransactionManifest } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { readOptional, timestamp } from "./portability-common.js";

interface RollbackFlags {
  transaction?: string;
  yes?: boolean;
  json?: boolean;
}

export async function rollbackCommand(flags: RollbackFlags): Promise<void> {
  const root = resolve(".");
  let transaction = flags.transaction;
  if (!transaction) {
    const stateContent = await readOptional(resolve(root, ".harness/state.json"));
    if (!stateContent) throw new Error("no portability state or transaction was provided");
    transaction = readPortabilityState(stateContent).lastKnownGood;
  }
  if (!transaction) throw new Error("no last-known-good transaction is available");
  const manifestPath = resolve(root, transaction);
  const manifestContent = await readOptional(manifestPath);
  if (!manifestContent) throw new Error(`transaction manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(manifestContent) as TransactionManifest;
  const preview = {
    transaction: manifestPath,
    status: manifest.status,
    files: manifest.changes.map((change) => ({
      path: change.path,
      action: change.before === null ? "remove" : change.after === null ? "restore" : "restore",
    })),
    approvalRequired: !flags.yes,
  };
  if (flags.json) console.log(JSON.stringify(preview, null, 2));
  else {
    console.log(`Rollback preview: ${preview.files.length} file(s) from ${manifest.timestamp}.`);
    for (const file of preview.files) console.log(`  ${file.action.padEnd(7)} ${file.path}`);
    if (!flags.yes) console.log("Preview only. Re-run with --yes to restore this transaction.");
  }
  if (!flags.yes) return;
  const result = await rollbackFileTransaction(manifest, {
    fs: new NodeFsProvider(root),
    timestamp: timestamp(),
  });
  if (!result.committed) throw new Error(result.error ?? "rollback transaction failed");
  if (!flags.json) console.log(`Rollback complete. Recovery transaction: ${result.manifestPath}`);
}
