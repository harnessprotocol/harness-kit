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

/** Schema version this build knows how to produce. */
export const STATE_SCHEMA_VERSION = 2;

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

/** Each version's statements, indexed by the version they produce. */
const MIGRATIONS: Record<number, readonly string[]> = { 1: V1, 2: V2 };

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
 * Both implementations run this probe before trusting a 0.
 *
 * Returns the version implied by what actually exists on disk.
 */
export const STATE_VERSION_PROBES: ReadonlyArray<{ version: number; sql: string }> = [
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
