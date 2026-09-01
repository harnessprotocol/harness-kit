import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "@harness-kit/core";
import { rollbackCommand } from "../src/commands/rollback.js";
import { SqliteStateStore } from "../src/state/sqlite-store.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

/**
 * Task 5 / AC-33: rollback points come from the shared ledger and span both
 * scopes, degrading to the project's state.json when the db is unusable.
 * Every test runs in a fresh temp project + temp HOME so the real machine's
 * ~/.harness/harness.db is never touched.
 */
describe.sequential("rollback ledger discovery", () => {
  let root: string;
  let project: string;
  let home: string;
  let originalCwd: string;
  let env: CliTestEnv;

  const record = (overrides: Partial<TransactionRecord> = {}): TransactionRecord => ({
    transactionId: "2026-09-01T10-00-00",
    appliedAt: "2026-09-01T10:00:00.000Z",
    roots: ["home"],
    manifestPath: ".harness/backups/2026-09-01T10-00-00/transaction.json",
    manifestRoot: home,
    backupDir: ".harness/backups/2026-09-01T10-00-00",
    surfaces: ["claude-code"],
    kinds: ["mcp-server"],
    identityKeys: ["mcp-server:github"],
    ...overrides,
  });

  async function seedLedger(...records: TransactionRecord[]): Promise<void> {
    await mkdir(join(home, ".harness"), { recursive: true });
    const store = await SqliteStateStore.open(join(home, ".harness", "harness.db"));
    try {
      for (const entry of records) await store.recordTransaction(entry);
    } finally {
      await store.close();
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-rollback-"));
    project = join(root, "project");
    home = join(root, "home");
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(project);
    vi.stubEnv("HOME", home);
    env = new CliTestEnv();
    env.setup();
  });

  afterEach(() => {
    env.restore();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("lists recorded points from both scopes, newest first", async () => {
    await seedLedger(
      record({ transactionId: "older", appliedAt: "2026-09-01T09:00:00.000Z", roots: ["project"] }),
      record({ transactionId: "newer", appliedAt: "2026-09-01T11:00:00.000Z", roots: ["home"] }),
    );
    await rollbackCommand({ list: true, json: true });
    const payload = JSON.parse(env.consoleLog.join("\n"));
    expect(payload.transactions.map((t: TransactionRecord) => t.transactionId)).toEqual([
      "newer",
      "older",
    ]);
    expect(payload.degraded).toBeNull();
  });

  it("says so when the ledger is unusable and falls back to project state", async () => {
    // A directory where the db file belongs makes the store unopenable.
    await mkdir(join(home, ".harness", "harness.db"), { recursive: true });
    await mkdir(join(project, ".harness"), { recursive: true });
    await writeFile(
      join(project, ".harness/state.json"),
      JSON.stringify({
        version: 1,
        lastApplied: [],
        ownership: [],
        lastKnownGood: ".harness/backups/legacy/transaction.json",
      }),
    );

    await rollbackCommand({ list: true });
    const output = env.consoleLog.join("\n");
    expect(output).toContain("Rollback ledger unavailable");
    expect(output).toContain("legacy");
  });

  it("does not fail listing when state.json is malformed", async () => {
    await mkdir(join(project, ".harness"), { recursive: true });
    await writeFile(join(project, ".harness/state.json"), "{ not json");
    await rollbackCommand({ list: true });
    expect(env.consoleLog.join("\n")).toContain("No rollback points recorded.");
  });

  it("reports nothing rather than failing on an empty machine", async () => {
    await rollbackCommand({ list: true });
    expect(env.consoleLog.join("\n")).toContain("No rollback points recorded.");
  });

  it("resolves a bare transaction id through the ledger to its own root", async () => {
    const backupDir = join(home, ".harness/backups/2026-09-01T10-00-00");
    await mkdir(backupDir, { recursive: true });
    await writeFile(
      join(backupDir, "transaction.json"),
      JSON.stringify({
        version: 2,
        timestamp: "2026-09-01T10-00-00",
        status: "committed",
        changes: [{ root: "home", path: ".claude.json", before: "{}", after: '{"a":1}' }],
      }),
    );
    await seedLedger(record());

    // Preview only — proves the id resolved against the home root, not cwd.
    await rollbackCommand({ transaction: "2026-09-01T10-00-00", json: true });
    const payload = JSON.parse(env.consoleLog.join("\n"));
    expect(payload.transaction).toBe(join(backupDir, "transaction.json"));
    expect(payload.files[0]).toMatchObject({ root: "home", path: ".claude.json" });
  });

  it("rejects an unknown transaction id", async () => {
    await seedLedger(record());
    await expect(rollbackCommand({ transaction: "nope" })).rejects.toThrow(
      /no recorded transaction with id/,
    );
  });
});
