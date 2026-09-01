import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "@harness-kit/core";
import { TauriTransactionLedger } from "../state-ledger";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const RECORD: TransactionRecord = {
  transactionId: "2026-09-01T10-00-00",
  appliedAt: "2026-09-01T10:00:00.000Z",
  roots: ["home"],
  manifestPath: ".harness/backups/ts/transaction.json",
  manifestRoot: "/Users/tester",
  backupDir: ".harness/backups/ts",
  surfaces: ["cursor"],
  kinds: ["mcp-server"],
  identityKeys: ["mcp-server:postgres"],
};

describe("TauriTransactionLedger", () => {
  beforeEach(() => invoke.mockReset());

  it("records through the Rust command", async () => {
    invoke.mockResolvedValue(undefined);
    await new TauriTransactionLedger().recordTransaction(RECORD);
    expect(invoke).toHaveBeenCalledWith("record_transaction", { record: RECORD });
  });

  it("surfaces a Rust-side failure so core's ledger guard can catch it", async () => {
    // core's recordAppliedTransaction swallows this — by the time it runs the
    // files are written, so failing an apply over a locked database would be
    // strictly worse than losing the rollback point. That contract is tested
    // in core; what matters here is that the bridge does not swallow it first.
    invoke.mockImplementationOnce(() => Promise.reject(new Error("database is locked")));
    const caught = await new TauriTransactionLedger()
      .recordTransaction(RECORD)
      .then(() => null)
      .catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("database is locked");
  });
});
