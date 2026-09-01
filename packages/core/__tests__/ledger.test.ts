import { describe, expect, it } from "vitest";
import { recordAppliedTransaction } from "../src/state/ledger.js";
import type { StateStore, TransactionRecord } from "../src/index.js";
import type { TransactionResult } from "../src/portability/types.js";

function fakeStore(onRecord?: () => void): StateStore & { records: TransactionRecord[] } {
  const records: TransactionRecord[] = [];
  return {
    records,
    async recordObservation() { return 1; },
    async latestObservation() { return null; },
    async getFingerprint() { return null; },
    async setFingerprint() {},
    async recordTransaction(record) {
      onRecord?.();
      records.push(record);
    },
    async listTransactions() { return records; },
    async close() {},
  };
}

const RESULT: TransactionResult = {
  committed: true,
  written: [".claude.json"],
  removed: [],
  rolledBack: [],
  backupDir: ".harness/backups/ts",
  manifestPath: ".harness/backups/ts/transaction.json",
};

const INPUT = {
  transactionId: "ts",
  appliedAt: "2026-09-01T10:00:00.000Z",
  manifestRoot: "/Users/tester",
  surfaces: ["claude-code"] as const,
  kinds: ["mcp-server"] as const,
  identityKeys: ["mcp-server:github"],
};

describe("transaction ledger recording (AC-32)", () => {
  it("records exactly one row for a committed apply", async () => {
    const store = fakeStore();
    const outcome = await recordAppliedTransaction(
      RESULT,
      [{ root: "home", path: ".claude.json", before: "{}", after: "{}" }],
      { ...INPUT, surfaces: [...INPUT.surfaces], kinds: [...INPUT.kinds] },
      store,
    );
    expect(outcome.recorded).toBe(true);
    expect(store.records).toHaveLength(1);
    expect(store.records[0]?.roots).toEqual(["home"]);
  });

  it("lists both roots for a mixed transaction, in a stable order", async () => {
    const store = fakeStore();
    await recordAppliedTransaction(
      RESULT,
      [
        { root: "home", path: ".claude.json", before: "{}", after: "{}" },
        { path: "CLAUDE.md", before: null, after: "# x" },
      ],
      { ...INPUT, surfaces: [...INPUT.surfaces], kinds: [...INPUT.kinds] },
      store,
    );
    expect(store.records[0]?.roots).toEqual(["project", "home"]);
  });

  it("does not record an uncommitted (rolled-back) apply", async () => {
    const store = fakeStore();
    const outcome = await recordAppliedTransaction(
      { ...RESULT, committed: false, error: "boom" },
      [{ path: "a.txt", before: "a", after: "b" }],
      { ...INPUT, surfaces: [...INPUT.surfaces], kinds: [...INPUT.kinds] },
      store,
    );
    expect(outcome.recorded).toBe(false);
    expect(store.records).toHaveLength(0);
  });

  it("degrades when the ledger write fails — the apply already succeeded", async () => {
    const store = fakeStore(() => {
      throw new Error("database is locked");
    });
    const outcome = await recordAppliedTransaction(
      RESULT,
      [{ path: "a.txt", before: "a", after: "b" }],
      { ...INPUT, surfaces: [...INPUT.surfaces], kinds: [...INPUT.kinds] },
      store,
    );
    expect(outcome.recorded).toBe(false);
    expect(outcome.error).toContain("database is locked");
  });

  it("tolerates having no store at all", async () => {
    const outcome = await recordAppliedTransaction(
      RESULT,
      [{ path: "a.txt", before: "a", after: "b" }],
      { ...INPUT, surfaces: [...INPUT.surfaces], kinds: [...INPUT.kinds] },
      null,
    );
    expect(outcome).toEqual({ recorded: false });
  });
});
