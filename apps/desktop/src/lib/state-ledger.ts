import { invoke } from "@tauri-apps/api/core";
import type { TransactionLedger, TransactionRecord } from "@harness-kit/core";

/**
 * The desktop's {@link TransactionLedger}, over the Rust ledger commands.
 *
 * The webview cannot open `~/.harness/harness.db` itself (no node builtins),
 * and the CLI's `rollback --list` reads that database — so without this, an
 * apply made from the drawer wrote a rollback manifest to disk that no
 * command could find. Rust owns the connection, applies the schema generated
 * from core, and resolves the path the same way the CLI does
 * (`HARNESS_STATE_PATH` included) so both agree on which file the ledger is.
 *
 * Implements only the ledger half deliberately: observation snapshots are the
 * CLI scan path's job, and stubbing them here would be a silent no-op.
 */
export class TauriTransactionLedger implements TransactionLedger {
  async recordTransaction(record: TransactionRecord): Promise<void> {
    await invoke("record_transaction", { record });
  }

  async listTransactions(limit?: number): Promise<TransactionRecord[]> {
    return invoke<TransactionRecord[]>("list_transactions", {
      limit: limit ?? null,
    });
  }
}
