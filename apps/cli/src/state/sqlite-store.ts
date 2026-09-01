import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type {
  ObservationSnapshot,
  ObservationSnapshotMeta,
  StateStore,
  StoredResource,
  SurfaceId,
  TransactionRecord,
  SurfaceScope,
} from "@harness-kit/core";

/**
 * SQLite-backed StateStore (design.md §4, D3/D4, Task 12). The CLI's driver
 * for the core StateStore interface — core stays driver-free; the desktop
 * bridges to this same database via Tauri in M2.
 *
 * Concurrency: the db is SHARED between the CLI and the desktop app, so we
 * open in WAL mode with a busy timeout, and every write is one short
 * transaction (WAL discipline: readers never block, writers queue briefly).
 */

/**
 * Full v1 DDL. M1 only uses meta/observations/observed_resources/fingerprints;
 * transactions (M2), plugin_installs (M3), and definitions_cache (M4) are
 * placeholder shapes that land now so later milestones migrate data, not
 * schema.
 */
/**
 * v2 replaces the v1 `transactions` placeholder with the real rollback ledger
 * (AC-32). The placeholder shipped in M1 with no readers or writers, so the
 * drop cannot lose data.
 */
const DDL_V2 = `
DROP TABLE IF EXISTS transactions;
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL,
  roots TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  manifest_root TEXT NOT NULL,
  backup_dir TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_applied_at ON transactions(applied_at DESC);
`;

const DDL_V1 = `
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  observed_at TEXT NOT NULL,
  platform TEXT NOT NULL,
  project_root TEXT NULL,
  home_root TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observed_resources (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  kind TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  digest TEXT NOT NULL,
  canonical_form TEXT NOT NULL, -- JSON (pre-sanitized canonicalForm)
  provenance_file TEXT NOT NULL,
  provenance_format TEXT NOT NULL,
  needs_confirmation INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_observed_resources_observation
  ON observed_resources(observation_id);
CREATE TABLE IF NOT EXISTS fingerprints (
  surface TEXT NOT NULL,
  scope TEXT NOT NULL,
  digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (surface, scope)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plugin_installs (
  id INTEGER PRIMARY KEY,
  surface TEXT NOT NULL,
  plugin TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  files TEXT NOT NULL,
  installed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS definitions_cache (
  id INTEGER PRIMARY KEY,
  bundle_number INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
`;

/**
 * Resolve the shared state db path, `~/.harness/harness.db`, creating its
 * directory when missing (same home resolution convention as
 * registry-client.ts's AUTH_PATH).
 *
 * `HARNESS_STATE_PATH` overrides the whole path. The state db is shared
 * between the CLI and the desktop app, so tests, CI, and anyone running two
 * checkouts against separate machine state need a way to point elsewhere
 * without touching the real one. The override names the FILE, not its
 * directory, so a caller can keep several databases side by side.
 */
export function defaultStatePath(): string {
  const override = process.env.HARNESS_STATE_PATH?.trim();
  if (override) {
    const path = resolve(override);
    tightenDirectory(dirname(path));
    return path;
  }
  const dir = resolve(homedir(), ".harness");
  tightenDirectory(dir);
  return resolve(dir, "harness.db");
}

/** Create a state directory if absent and keep it owner-only. */
function tightenDirectory(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdir's mode only applies on creation — tighten a pre-existing dir too.
  // Best-effort: chmod is meaningless on Windows and may fail on exotic
  // filesystems; state must still open.
  if (process.platform !== "win32") {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // best effort
    }
  }
}

interface ObservationRow {
  id: number;
  observed_at: string;
  platform: string;
  project_root: string | null;
  home_root: string;
}

interface ResourceRow {
  surface: string;
  kind: string;
  identity_key: string;
  name: string;
  scope: string;
  digest: string;
  canonical_form: string;
  provenance_file: string;
  provenance_format: string;
  needs_confirmation: number;
}

export class SqliteStateStore implements StateStore {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.migrate();
  }

  /**
   * Opens (creating if absent) the db at `path` and migrates it to v1.
   *
   * node:sqlite is imported lazily HERE, not at module top level: a static
   * import makes every CLI command (validate/compile/--help) print Node's
   * "SQLite is an experimental feature" warning to stderr. With the dynamic
   * import the warning appears only when the state store is actually used.
   * The type-only import above erases at build time and does not trigger it.
   */
  static async open(path: string): Promise<SqliteStateStore> {
    const { DatabaseSync: Database } = await import("node:sqlite");
    const store = new SqliteStateStore(new Database(path));
    // Best-effort permission tightening — the db caches observed canonical
    // forms. POSIX only; Windows has no meaningful chmod.
    if (process.platform !== "win32") {
      try {
        chmodSync(path, 0o600);
      } catch {
        // best effort
      }
    }
    return store;
  }

  /** v0 -> v2, keyed off meta.schema_version. Idempotent. */
  private migrate(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("CREATE TABLE IF NOT EXISTS meta (schema_version INTEGER NOT NULL)");
      const row = this.db.prepare("SELECT schema_version FROM meta").get() as
        | { schema_version: number }
        | undefined;
      const version = row?.schema_version ?? 0;
      if (version < 1) {
        this.db.exec(DDL_V1);
        this.db.prepare("INSERT INTO meta (schema_version) VALUES (?)").run(1);
      }
      if (version < 2) {
        this.db.exec(DDL_V2);
        this.db.prepare("UPDATE meta SET schema_version = ?").run(2);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async recordObservation(
    meta: ObservationSnapshotMeta,
    resources: StoredResource[],
  ): Promise<number> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const inserted = this.db
        .prepare(
          "INSERT INTO observations (observed_at, platform, project_root, home_root) VALUES (?, ?, ?, ?)",
        )
        .run(meta.observedAt, meta.platform, meta.projectRoot, meta.homeRoot);
      const observationId = Number(inserted.lastInsertRowid);

      const insertResource = this.db.prepare(
        `INSERT INTO observed_resources
          (observation_id, surface, kind, identity_key, name, scope, digest,
           canonical_form, provenance_file, provenance_format, needs_confirmation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const resource of resources) {
        insertResource.run(
          observationId,
          resource.surface,
          resource.kind,
          resource.identityKey,
          resource.name,
          resource.scope,
          resource.digest,
          JSON.stringify(resource.canonicalForm ?? null),
          resource.provenance.file,
          resource.provenance.formatId,
          resource.needsConfirmation ? 1 : 0,
        );
      }
      this.db.exec("COMMIT");
      return observationId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async latestObservation(): Promise<ObservationSnapshot | null> {
    const snapshot = this.db
      .prepare(
        "SELECT id, observed_at, platform, project_root, home_root FROM observations ORDER BY id DESC LIMIT 1",
      )
      .get() as ObservationRow | undefined;
    if (!snapshot) return null;

    const rows = this.db
      .prepare(
        `SELECT surface, kind, identity_key, name, scope, digest, canonical_form,
                provenance_file, provenance_format, needs_confirmation
         FROM observed_resources WHERE observation_id = ? ORDER BY id`,
      )
      .all(snapshot.id) as unknown as ResourceRow[];

    return {
      id: snapshot.id,
      meta: {
        observedAt: snapshot.observed_at,
        platform: snapshot.platform,
        projectRoot: snapshot.project_root,
        homeRoot: snapshot.home_root,
      },
      resources: rows.map((row) => ({
        surface: row.surface as StoredResource["surface"],
        kind: row.kind as StoredResource["kind"],
        identityKey: row.identity_key,
        name: row.name,
        scope: row.scope as StoredResource["scope"],
        digest: row.digest,
        canonicalForm: JSON.parse(row.canonical_form) as unknown,
        provenance: {
          file: row.provenance_file,
          formatId: row.provenance_format as StoredResource["provenance"]["formatId"],
        },
        ...(row.needs_confirmation ? { needsConfirmation: true as const } : {}),
      })),
    };
  }

  async getFingerprint(surface: SurfaceId, scope: SurfaceScope): Promise<string | null> {
    const row = this.db
      .prepare("SELECT digest FROM fingerprints WHERE surface = ? AND scope = ?")
      .get(surface, scope) as { digest: string } | undefined;
    return row?.digest ?? null;
  }

  async setFingerprint(surface: SurfaceId, scope: SurfaceScope, digest: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO fingerprints (surface, scope, digest, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(surface, scope) DO UPDATE SET
           digest = excluded.digest,
           updated_at = excluded.updated_at`,
      )
      .run(surface, scope, digest, new Date().toISOString());
  }

  async recordTransaction(record: TransactionRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO transactions
           (transaction_id, applied_at, roots, manifest_path, manifest_root, backup_dir, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(transaction_id) DO UPDATE SET
           applied_at = excluded.applied_at,
           roots = excluded.roots,
           manifest_path = excluded.manifest_path,
           manifest_root = excluded.manifest_root,
           backup_dir = excluded.backup_dir,
           payload = excluded.payload`,
      )
      .run(
        record.transactionId,
        record.appliedAt,
        JSON.stringify(record.roots),
        record.manifestPath,
        record.manifestRoot,
        record.backupDir,
        JSON.stringify({
          surfaces: record.surfaces,
          kinds: record.kinds,
          identityKeys: record.identityKeys,
        }),
      );
  }

  async listTransactions(limit?: number): Promise<TransactionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT transaction_id, applied_at, roots, manifest_path, manifest_root, backup_dir, payload
           FROM transactions
          ORDER BY applied_at DESC, id DESC
          ${limit === undefined ? "" : "LIMIT ?"}`,
      )
      .all(...(limit === undefined ? [] : [limit])) as Array<{
      transaction_id: string;
      applied_at: string;
      roots: string;
      manifest_path: string;
      manifest_root: string;
      backup_dir: string;
      payload: string;
    }>;
    return rows.map((row) => {
      const payload = JSON.parse(row.payload) as Pick<
        TransactionRecord,
        "surfaces" | "kinds" | "identityKeys"
      >;
      return {
        transactionId: row.transaction_id,
        appliedAt: row.applied_at,
        roots: JSON.parse(row.roots) as TransactionRecord["roots"],
        manifestPath: row.manifest_path,
        manifestRoot: row.manifest_root,
        backupDir: row.backup_dir,
        surfaces: payload.surfaces,
        kinds: payload.kinds,
        identityKeys: payload.identityKeys,
      };
    });
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
