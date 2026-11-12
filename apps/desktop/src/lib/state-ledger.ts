import { invoke } from "@tauri-apps/api/core";
import type { TransactionRecord, TransactionRecorder } from "@harness-kit/core";

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
 * Records only. The one reader the app has is Settings › Activity's Changes
 * list (`list_changes` / `undo_change`, see tauri.ts), and it lives in Rust
 * with its own checks, so the webview never receives raw ledger rows or
 * supplies a rollback manifest. A record that carries `copiedFrom` also makes
 * Rust write the Machine copy's audit entry. Observation snapshots belong to
 * the CLI's scan path; stubbing them here would be a silent no-op.
 */
export class TauriTransactionLedger implements TransactionRecorder {
  async recordTransaction(record: TransactionRecord): Promise<void> {
    await invoke("record_transaction", { record });
  }
}
