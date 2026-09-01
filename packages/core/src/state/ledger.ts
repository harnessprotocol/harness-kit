import type {
  TransactionFileChange,
  TransactionResult,
  TransactionRootId,
} from "../portability/types.js";
import type { HarnessResourceKind } from "../portability/types.js";
import type { SurfaceId } from "../surfaces/types.js";
import type { TransactionRecord, TransactionRecorder } from "./store.js";

/** What the caller knows about an apply that the transaction result does not. */
export interface LedgerEntryInput {
  /** Transaction id — the timestamp passed to applyFileTransaction. */
  transactionId: string;
  /** ISO-8601 commit time. Callers supply it; this layer never reads the clock. */
  appliedAt: string;
  /** Absolute path of the root anchoring the manifest. */
  manifestRoot: string;
  surfaces: SurfaceId[];
  kinds: HarnessResourceKind[];
  identityKeys: string[];
}

export interface LedgerOutcome {
  recorded: boolean;
  /** Present when recording was attempted and failed. */
  error?: string;
}

/** Roots a change set touched, in a stable order. */
function rootsTouched(changes: TransactionFileChange[]): TransactionRootId[] {
  const seen = new Set<TransactionRootId>();
  for (const change of changes) seen.add(change.root ?? "project");
  return (["project", "home"] as const).filter((root) => seen.has(root));
}

/**
 * Record a committed transaction as a rollback point (AC-32).
 *
 * The ledger is an *index*: preimages and the manifest are already on disk by
 * the time this runs, so a failure here costs history, never recoverability.
 * It therefore degrades rather than throwing — the same posture as M1's
 * observation snapshots. An uncommitted result is never recorded.
 */
export async function recordAppliedTransaction(
  result: TransactionResult,
  changes: TransactionFileChange[],
  input: LedgerEntryInput,
  store: TransactionRecorder | null,
): Promise<LedgerOutcome> {
  if (!result.committed || store === null) return { recorded: false };
  const record: TransactionRecord = {
    transactionId: input.transactionId,
    appliedAt: input.appliedAt,
    roots: rootsTouched(changes),
    manifestPath: result.manifestPath,
    manifestRoot: input.manifestRoot,
    backupDir: result.backupDir,
    surfaces: input.surfaces,
    kinds: input.kinds,
    identityKeys: input.identityKeys,
  };
  try {
    await store.recordTransaction(record);
    return { recorded: true };
  } catch (error) {
    return { recorded: false, error: error instanceof Error ? error.message : String(error) };
  }
}
