/**
 * The machine state database schema — the single source shared by both
 * implementations of {@link StateStore}.
 *
 * The CLI applies this through `node:sqlite`; the desktop cannot (the webview
 * has no node builtins — the node:crypto production crash institutionalized
 * that rule), so it goes through Rust, which reads a generated artifact built
 * from these same constants. Hand-copying the DDL into Rust would be the
 * drift hazard the surface write-scope allowlist already taught us to avoid,
 * and it matters more here: a desktop-only user has no CLI run to create the
 * database, so Rust genuinely has to be able to build it from nothing.
 *
 * Statements are separate strings rather than one blob because the Rust side
 * executes them individually.
 */

/**
 * Schema version this build knows how to produce.
 *
 * CONSTRAINT FOR WHOEVER BUMPS THIS: migrations on `transactions` must stay
 * ADDITIVE. The CLI ships via Homebrew and the app via a cask, so they update
 * independently and version skew between them is guaranteed, not
 * hypothetical. Forward skew is only safe because an older build's
 * seven-column SELECT still works and its INSERT still satisfies every
 * constraint. Renaming a column breaks the old reader; adding a NOT NULL
 * without a default breaks the old writer — and both sides swallow ledger
 * errors by design, so it would fail silently.
 */
export const STATE_SCHEMA_VERSION = 4;

/**
 * v1: observations, resources, fingerprints, plus placeholder shapes for
 * transactions / plugin_installs / definitions_cache so later milestones
 * migrate data rather than schema.
 */
const V1: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  observed_at TEXT NOT NULL,
  platform TEXT NOT NULL,
  project_root TEXT NULL,
  home_root TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS observed_resources (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  kind TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  digest TEXT NOT NULL,
  canonical_form TEXT NOT NULL,
  provenance_file TEXT NOT NULL,
  provenance_format TEXT NOT NULL,
  needs_confirmation INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE INDEX IF NOT EXISTS idx_observed_resources_observation
  ON observed_resources(observation_id)`,
  `CREATE TABLE IF NOT EXISTS fingerprints (
  surface TEXT NOT NULL,
  scope TEXT NOT NULL,
  digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (surface, scope)
)`,
  `CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS plugin_installs (
  id INTEGER PRIMARY KEY,
  surface TEXT NOT NULL,
  plugin TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  files TEXT NOT NULL,
  installed_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS definitions_cache (
  id INTEGER PRIMARY KEY,
  bundle_number INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
)`,
];

/**
 * v2 replaces the v1 `transactions` placeholder with the real rollback ledger
 * (AC-32). The placeholder shipped in M1 with no readers or writers, so the
 * drop cannot lose data.
 */
const V2: readonly string[] = [
  `DROP TABLE IF EXISTS transactions`,
  `CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL,
  roots TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  manifest_root TEXT NOT NULL,
  backup_dir TEXT NOT NULL,
  payload TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS transactions_applied_at ON transactions(applied_at DESC)`,
];

/**
 * v3: drift acknowledgements (AC-37). Purely additive — a CREATE with no
 * DROP — so a v2 reader that never learns about this table keeps working,
 * which is the constraint at the top of this file.
 *
 * Keyed by the tuple that identifies one drift item within one scope, the
 * same key the desktop already used in its own database. `acknowledged_at`
 * is supplied by the caller; nothing here reads a clock.
 */
const V3: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS drift_acknowledgements (
  scope_root TEXT NOT NULL,
  adapter TEXT NOT NULL,
  path TEXT NOT NULL,
  harness_name TEXT NOT NULL,
  slot TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  PRIMARY KEY (scope_root, adapter, path, harness_name, slot)
)`,
];

/**
 * v4 replaces the v1 `definitions_cache` placeholder with a table the feed can
 * actually use (AC-25), and adds the anti-rollback floor beside it.
 *
 * The placeholder was `(bundle_number, fetched_at, payload TEXT)`, written
 * before the verification design existed, and it cannot hold what the loader
 * needs. `loadDefinitions` RE-VERIFIES the cache rather than trusting it, so
 * it needs the exact bytes the signature covers plus the detached signature
 * itself — the placeholder has no signature column at all, and "payload" as
 * decoded TEXT does not round-trip the bytes a signature is computed over.
 * Like the v2 `transactions` swap, the placeholder shipped with no readers or
 * writers, so the DROP cannot lose data.
 *
 * Bytes are stored base64 in TEXT rather than as BLOB deliberately: this DDL
 * is executed by BOTH `node:sqlite` and rusqlite, and TEXT needs no
 * driver-specific binding on either side. Encoding is one-way and
 * deterministic, so the decode round-trip is exact.
 *
 * `definitions_history` is a SEPARATE table, and that separation is the
 * point. The anti-rollback floor must not live in the cache: the cache is a
 * file any process running as this user can delete, and if deleting it also
 * reset the floor, an attacker would clear the defence and then replay a
 * genuinely-signed old bundle. Deleting the cache costs a re-fetch; it must
 * never cost the floor.
 *
 * Both tables are single-row (`CHECK (id = 1)`) — there is one machine and
 * one feed, and an UPSERT on a fixed id cannot silently accumulate rows.
 */
const V4: readonly string[] = [
  `DROP TABLE IF EXISTS definitions_cache`,
  `CREATE TABLE definitions_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bundle_number INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  payload_b64 TEXT NOT NULL,
  signature_b64 TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS definitions_history (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  highest_bundle_number INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`,
];

/** Each version's statements, indexed by the version they produce. */
const MIGRATIONS: Record<number, readonly string[]> = { 1: V1, 2: V2, 3: V3, 4: V4 };

/**
 * Statements needed to bring a database at `fromVersion` up to current.
 * `fromVersion` 0 means "no database yet".
 */
export function stateSchemaStatements(fromVersion: number): string[] {
  const statements: string[] = [];
  for (let version = fromVersion + 1; version <= STATE_SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    // Bumping STATE_SCHEMA_VERSION without adding its statements would stamp
    // meta as migrated while creating nothing, and every later open would skip
    // the migration forever. Fail loudly at the first call instead.
    if (!step) throw new Error(`no migration defined for state schema v${version}`);
    statements.push(...step);
  }
  return statements;
}

/**
 * Detects the schema version from the tables themselves, for the case where
 * `meta` exists but carries no row.
 *
 * That state is ambiguous in the worst possible direction: "no version row"
 * reads identically to "fresh database", and the v2 step opens with
 * `DROP TABLE transactions`. Treating an empty `meta` as version 0 therefore
 * destroys every rollback point on a database that is actually current.
 * Both implementations run these probes before trusting a 0 — the CLI in
 * SqliteStateStore.migrate(), the desktop in harness_state.rs's
 * detect_version. (An earlier version of this comment claimed that while only
 * the Rust side used them, which left the CLI destroying ledgers on exactly
 * the case the comment promised was handled.)
 *
 * Returns the version implied by what actually exists on disk.
 */
export const STATE_VERSION_PROBES: ReadonlyArray<{ version: number; sql: string }> = [
  {
    // Probes are checked HIGHEST FIRST, so a new version needs an entry here
    // or its database reports as the previous one and re-runs the migration.
    // For v4 that would be actively destructive rather than merely wasteful:
    // V4 opens with `DROP TABLE IF EXISTS definitions_cache`, so a v4
    // database mis-probed as v3 would discard a populated cache on every
    // single startup, silently, and simply re-fetch each time.
    version: 4,
    sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'definitions_history'",
  },
  {
    version: 3,
    sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'drift_acknowledgements'",
  },
  {
    version: 2,
    sql: "SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name = 'transaction_id'",
  },
  {
    version: 1,
    sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'observations'",
  },
];

/** Every migration step, for generating the Rust-side artifact. */
export function stateSchemaMigrations(): Record<number, string[]> {
  return Object.fromEntries(
    Object.entries(MIGRATIONS).map(([version, statements]) => [version, [...statements]]),
  );
}
