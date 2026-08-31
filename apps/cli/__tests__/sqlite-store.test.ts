import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ObservationSnapshotMeta, StoredResource } from "@harness-kit/core";
import { SqliteStateStore } from "../src/state/sqlite-store.js";

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
    store = new SqliteStateStore(dbPath);
  });

  afterEach(async () => {
    try {
      await store.close();
    } catch {
      // already closed by the test
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("migrates v0 -> v1: schema_version is 1 and all six tables exist", async () => {
    // Touch the store so migration has run.
    expect(await store.latestObservation()).toBeNull();

    const raw = new DatabaseSync(dbPath);
    try {
      const version = raw.prepare("SELECT schema_version FROM meta").get() as {
        schema_version: number;
      };
      expect(version.schema_version).toBe(1);

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

    const reopened = new SqliteStateStore(dbPath);
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
        expect(version.schema_version).toBe(1);
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

    const again = new SqliteStateStore(dbPath);
    try {
      const latest = await again.latestObservation();
      expect(latest!.resources).toEqual([RESOURCES[0]]);
    } finally {
      await again.close();
    }
  });
});
