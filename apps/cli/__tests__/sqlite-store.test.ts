import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  ObservationSnapshotMeta,
  StoredResource,
  TransactionRecord,
} from "@harness-kit/core";
import { defaultStatePath, SqliteStateStore } from "../src/state/sqlite-store.js";

const META: ObservationSnapshotMeta = {
  observedAt: "2026-08-31T12:00:00.000Z",
  platform: "darwin",
  projectRoot: "/repo/project",
  homeRoot: "/Users/tester",
};

const RESOURCES: StoredResource[] = [
  {
    surface: "claude-code",
    kind: "mcp-server",
    identityKey: "mcp-server:github",
    name: "GitHub",
    scope: "user",
    digest: "sha256:aaa",
    canonicalForm: { transport: "stdio", command: "gh-mcp", env: { TOKEN: "<secret>" } },
    provenance: { file: "~/.claude.json", formatId: "json-mcpservers" },
  },
  {
    surface: "cursor",
    kind: "skill",
    identityKey: "skill:review",
    name: "review",
    scope: "project",
    digest: "sha256:bbb",
    canonicalForm: { name: "review", content: "# Review" },
    provenance: { file: ".cursor/skills/review/SKILL.md", formatId: "skills-dir" },
    needsConfirmation: true,
  },
  {
    surface: "copilot-vscode",
    kind: "instructions",
    identityKey: "instructions:agents.md",
    name: "AGENTS.md",
    scope: "project",
    digest: "sha256:ccc",
    canonicalForm: { content: "Do the thing." },
    provenance: { file: "AGENTS.md", formatId: "markdown-instructions" },
  },
];

describe("SqliteStateStore", () => {
  let dir: string;
  let dbPath: string;
  let store: SqliteStateStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "harness-sqlite-store-"));
    dbPath = join(dir, "harness.db");
    store = await SqliteStateStore.open(dbPath);
  });

  afterEach(async () => {
    try {
      await store.close();
    } catch {
      // already closed by the test
    }
    await rm(dir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "opens the db file with owner-only (0600) permissions",
    async () => {
      const mode = (await stat(dbPath)).mode & 0o777;
      expect(mode).toBe(0o600);
    },
  );

  it("migrates v0 -> v2: schema_version is 2 and all six tables exist", async () => {
    // Touch the store so migration has run.
    expect(await store.latestObservation()).toBeNull();

    const raw = new DatabaseSync(dbPath);
    try {
      const version = raw.prepare("SELECT schema_version FROM meta").get() as {
        schema_version: number;
      };
      expect(version.schema_version).toBe(2);

      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      for (const table of [
        "meta",
        "observations",
        "observed_resources",
        "fingerprints",
        "transactions",
        "plugin_installs",
        "definitions_cache",
      ]) {
        expect(tables).toContain(table);
      }
    } finally {
      raw.close();
    }
  });

  it("round-trips an observation snapshot through latestObservation", async () => {
    const meta: ObservationSnapshotMeta = { ...META, projectRoot: null };
    const id = await store.recordObservation(meta, RESOURCES);
    expect(id).toBeGreaterThan(0);

    const latest = await store.latestObservation();
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(id);
    expect(latest!.meta).toEqual(meta);
    expect(latest!.resources).toEqual(RESOURCES);
  });

  it("latestObservation returns the newest of two snapshots", async () => {
    await store.recordObservation(META, [RESOURCES[0]]);
    const secondId = await store.recordObservation(
      { ...META, observedAt: "2026-08-31T13:00:00.000Z" },
      [RESOURCES[1], RESOURCES[2]],
    );

    const latest = await store.latestObservation();
    expect(latest!.id).toBe(secondId);
    expect(latest!.meta.observedAt).toBe("2026-08-31T13:00:00.000Z");
    expect(latest!.resources).toEqual([RESOURCES[1], RESOURCES[2]]);
  });

  it("fingerprints: set, get, overwrite, unknown -> null", async () => {
    expect(await store.getFingerprint("claude-code", "user")).toBeNull();

    await store.setFingerprint("claude-code", "user", "sha256:one");
    expect(await store.getFingerprint("claude-code", "user")).toBe("sha256:one");

    await store.setFingerprint("claude-code", "user", "sha256:two");
    expect(await store.getFingerprint("claude-code", "user")).toBe("sha256:two");

    // Scope is part of the key.
    expect(await store.getFingerprint("claude-code", "project")).toBeNull();
    expect(await store.getFingerprint("cursor", "user")).toBeNull();
  });

  it("WAL: a second connection can read while a write txn is open", async () => {
    await store.recordObservation(META, [RESOURCES[0]]);

    const connA = new DatabaseSync(dbPath);
    const connB = new DatabaseSync(dbPath);
    try {
      connA.exec("PRAGMA busy_timeout=100");
      connB.exec("PRAGMA busy_timeout=100");
      connA.exec("BEGIN IMMEDIATE");
      connA
        .prepare(
          "INSERT INTO observations (observed_at, platform, project_root, home_root) VALUES (?, ?, ?, ?)",
        )
        .run("2026-08-31T14:00:00.000Z", "darwin", null, "/Users/tester");

      // WAL proof: reader B is not blocked by writer A's open transaction,
      // and sees the pre-transaction state.
      const during = connB.prepare("SELECT COUNT(*) AS n FROM observations").get() as {
        n: number;
      };
      expect(during.n).toBe(1);

      connA.exec("COMMIT");

      const after = connB.prepare("SELECT COUNT(*) AS n FROM observations").get() as {
        n: number;
      };
      expect(after.n).toBe(2);
    } finally {
      connA.close();
      connB.close();
    }
  });

  it("recordObservation is atomic: a failing resource row leaves no snapshot", async () => {
    const poisoned: StoredResource[] = [
      RESOURCES[0],
      // Circular canonicalForm makes JSON.stringify throw mid-bulk-insert.
      (() => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return { ...RESOURCES[1], canonicalForm: circular };
      })(),
    ];

    await expect(store.recordObservation(META, poisoned)).rejects.toThrow();

    expect(await store.latestObservation()).toBeNull();
    const raw = new DatabaseSync(dbPath);
    try {
      const observations = raw.prepare("SELECT COUNT(*) AS n FROM observations").get() as {
        n: number;
      };
      const resources = raw.prepare("SELECT COUNT(*) AS n FROM observed_resources").get() as {
        n: number;
      };
      expect(observations.n).toBe(0);
      expect(resources.n).toBe(0);
    } finally {
      raw.close();
    }
  });

  it("persists across reopen and migration is idempotent", async () => {
    const id = await store.recordObservation(META, RESOURCES);
    await store.setFingerprint("cursor", "project", "sha256:persist");
    await store.close();

    const reopened = await SqliteStateStore.open(dbPath);
    try {
      const latest = await reopened.latestObservation();
      expect(latest!.id).toBe(id);
      expect(latest!.resources).toEqual(RESOURCES);
      expect(await reopened.getFingerprint("cursor", "project")).toBe("sha256:persist");

      const raw = new DatabaseSync(dbPath);
      try {
        const version = raw.prepare("SELECT schema_version FROM meta").get() as {
          schema_version: number;
        };
        expect(version.schema_version).toBe(2);
        const metaRows = raw.prepare("SELECT COUNT(*) AS n FROM meta").get() as { n: number };
        expect(metaRows.n).toBe(1);
      } finally {
        raw.close();
      }
    } finally {
      await reopened.close();
    }
  });

  it("close() releases the file so a subsequent open works", async () => {
    await store.recordObservation(META, [RESOURCES[0]]);
    await store.close();

    await expect(store.latestObservation()).rejects.toThrow();

    const again = await SqliteStateStore.open(dbPath);
    try {
      const latest = await again.latestObservation();
      expect(latest!.resources).toEqual([RESOURCES[0]]);
    } finally {
      await again.close();
    }
  });
});

describe("transaction ledger (AC-32)", () => {
  let dir: string;
  let store: SqliteStateStore;

  const record = (overrides: Partial<TransactionRecord> = {}): TransactionRecord => ({
    transactionId: "2026-09-01T10-00-00",
    appliedAt: "2026-09-01T10:00:00.000Z",
    roots: ["home"],
    manifestPath: ".harness/backups/2026-09-01T10-00-00/transaction.json",
    manifestRoot: "/Users/tester",
    backupDir: ".harness/backups/2026-09-01T10-00-00",
    surfaces: ["claude-code"],
    kinds: ["mcp-server"],
    identityKeys: ["mcp-server:github"],
    ...overrides,
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "harness-sqlite-ledger-"));
    store = await SqliteStateStore.open(join(dir, "harness.db"));
  });

  afterEach(async () => {
    try {
      await store.close();
    } catch {
      // already closed by the test
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a record", async () => {
    const input = record();
    await store.recordTransaction(input);
    expect(await store.listTransactions()).toEqual([input]);
  });

  it("lists newest first across both roots", async () => {
    await store.recordTransaction(record({ transactionId: "old", appliedAt: "2026-09-01T09:00:00.000Z" }));
    await store.recordTransaction(
      record({
        transactionId: "new",
        appliedAt: "2026-09-01T11:00:00.000Z",
        roots: ["project", "home"],
      }),
    );
    const listed = await store.listTransactions();
    expect(listed.map((entry) => entry.transactionId)).toEqual(["new", "old"]);
    expect(listed[0]?.roots).toEqual(["project", "home"]);
  });

  it("honours a limit", async () => {
    for (const n of [1, 2, 3]) {
      await store.recordTransaction(
        record({ transactionId: `t${n}`, appliedAt: `2026-09-01T1${n}:00:00.000Z` }),
      );
    }
    expect(await store.listTransactions(2)).toHaveLength(2);
  });

  it("is idempotent on the same transaction id", async () => {
    await store.recordTransaction(record());
    await store.recordTransaction(record({ surfaces: ["cursor"] }));
    const listed = await store.listTransactions();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.surfaces).toEqual(["cursor"]);
  });

  it("migrates a v1 database in place", async () => {
    // The M1 placeholder table had (id, created_at, payload) and no readers;
    // an existing db must gain the real ledger without being recreated.
    const legacyDir = await mkdtemp(join(tmpdir(), "harness-sqlite-v1-"));
    const legacyPath = join(legacyDir, "harness.db");
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec("CREATE TABLE meta (schema_version INTEGER NOT NULL)");
    legacy.exec("INSERT INTO meta (schema_version) VALUES (1)");
    legacy.exec(
      "CREATE TABLE transactions (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)",
    );
    legacy.close();

    const migrated = await SqliteStateStore.open(legacyPath);
    try {
      await migrated.recordTransaction(record());
      expect(await migrated.listTransactions()).toHaveLength(1);
    } finally {
      await migrated.close();
      await rm(legacyDir, { recursive: true, force: true });
    }
  });
});

describe("HARNESS_STATE_PATH override", () => {
  it("uses the override and creates its directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-state-override-"));
    const target = join(dir, "nested", "custom.db");
    vi.stubEnv("HARNESS_STATE_PATH", target);
    try {
      expect(defaultStatePath()).toBe(target);
      const store = await SqliteStateStore.open(defaultStatePath());
      await store.close();
      await expect(stat(target)).resolves.toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to ~/.harness when the override is blank", () => {
    vi.stubEnv("HARNESS_STATE_PATH", "   ");
    try {
      expect(defaultStatePath().endsWith(join(".harness", "harness.db"))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("empty meta must not destroy the ledger", () => {
  it("keeps rollback points when meta has no version row", async () => {
    // The exact scenario harness_state.rs's a_read_never_destroys_the_ledger
    // covers on the Rust side. The CLI path runs on every rollback --list,
    // scan, and sync — far more traffic than the desktop path that was
    // hardened — so a one-sided guard hands the landmine to the busier caller.
    const dir = await mkdtemp(join(tmpdir(), "harness-empty-meta-"));
    const dbPath = join(dir, "harness.db");
    const store = await SqliteStateStore.open(dbPath);
    await store.recordTransaction({
      transactionId: "keep-me",
      appliedAt: "2026-09-01T10:00:00.000Z",
      roots: ["home"],
      manifestPath: ".harness/backups/a/transaction.json",
      manifestRoot: "/Users/tester",
      backupDir: ".harness/backups/a",
      surfaces: ["cursor"],
      kinds: ["mcp-server"],
      identityKeys: ["mcp-server:postgres"],
    });
    await store.close();

    // Lose the version row, as a crash mid-provision or a damaged page would.
    const raw = new DatabaseSync(dbPath);
    raw.exec("DELETE FROM meta");
    raw.close();

    const reopened = await SqliteStateStore.open(dbPath);
    try {
      const listed = await reopened.listTransactions();
      expect(listed.map((entry) => entry.transactionId)).toEqual(["keep-me"]);
    } finally {
      await reopened.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
