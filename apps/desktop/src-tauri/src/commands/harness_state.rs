use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::OnceLock;

/// The machine-state schema, generated from core
/// (apps/desktop/scripts/generate-state-schema.mjs).
///
/// The database at `~/.harness/harness.db` is SHARED with the CLI, which
/// applies the same statements through `node:sqlite`. Rust needs them rather
/// than assuming the CLI created the file first: a desktop-only user never
/// runs the CLI. A vitest asserts this file still matches core, so the two
/// implementations cannot build different databases from the same version.
const STATE_SCHEMA_JSON: &str = include_str!("../../generated/state-schema.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StateSchema {
    version: i64,
    /// Keyed by the version each step produces, as strings (JSON object keys).
    migrations: BTreeMap<String, Vec<String>>,
    /// Highest-first probes that infer the version from the tables themselves.
    version_probes: Vec<VersionProbe>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionProbe {
    version: i64,
    sql: String,
}

fn schema() -> &'static StateSchema {
    static SCHEMA: OnceLock<StateSchema> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        serde_json::from_str(STATE_SCHEMA_JSON).expect("generated state-schema.json must parse")
    })
}

/// One committed apply, mirroring core's `TransactionRecord`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRecord {
    pub transaction_id: String,
    pub applied_at: String,
    pub roots: Vec<String>,
    pub manifest_path: String,
    pub manifest_root: String,
    pub backup_dir: String,
    pub surfaces: Vec<String>,
    pub kinds: Vec<String>,
    pub identity_keys: Vec<String>,
}

/// The `payload` column's JSON, shared with the CLI.
///
/// `rename_all` rather than one hand-renamed field: the mixed form is how a
/// key silently failed to deserialize into an empty Vec during this work, and
/// a struct where only one field carries a rename invites exactly that.
/// `default` on each field means a payload missing one key blanks only that
/// key rather than all three (see the read path below).
#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecordPayload {
    #[serde(default)]
    surfaces: Vec<String>,
    #[serde(default)]
    kinds: Vec<String>,
    #[serde(default)]
    identity_keys: Vec<String>,
}

/// Resolve the shared db path the same way the CLI does, `HARNESS_STATE_PATH`
/// included — if the two disagreed, the app would write a ledger the CLI's
/// `rollback --list` never reads.
///
/// One asymmetry worth knowing rather than claiming away: a Finder-launched
/// app inherits no shell environment, so it will not see HARNESS_STATE_PATH
/// even when the user's shell exports it. The override is therefore reliable
/// for CI and tests, not for a GUI launch — parity holds for the default
/// path, which is what matters in practice.
fn state_path() -> Result<PathBuf, String> {
    if let Ok(override_path) = std::env::var("HARNESS_STATE_PATH") {
        let trimmed = override_path.trim();
        if !trimmed.is_empty() {
            // Absolutize, as the CLI's defaultStatePath does with resolve().
            // A relative override would otherwise resolve against each
            // process's working directory and point the app and the CLI at
            // DIFFERENT files — the exact drift this function exists to avoid.
            let path = std::fs::canonicalize(trimmed).unwrap_or_else(|_| {
                std::env::current_dir()
                    .map(|cwd| cwd.join(trimmed))
                    .unwrap_or_else(|_| PathBuf::from(trimmed))
            });
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create state directory: {}", e))?;
            }
            return Ok(path);
        }
    }
    let dir = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".harness");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create ~/.harness: {}", e))?;
    Ok(dir.join("harness.db"))
}

/// Open the shared database and bring it to the current schema version.
///
/// WAL plus a busy timeout because a CLI process may be writing concurrently;
/// every write is one short transaction so readers never block.
fn open_at(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path)
        .map_err(|e| format!("Failed to open state database: {}", e))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    // The WAL conversion needs an exclusive lock and returns SQLITE_BUSY
    // WITHOUT honouring busy_timeout, so under contention this fails outright
    // — and because ledger errors are swallowed by design, that silently cost
    // the user a rollback point. Only convert when the database is not already
    // in WAL, and treat a busy conversion as non-fatal: another process is
    // converting it, and journal mode is a durable property of the file.
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap_or_default();
    if !mode.eq_ignore_ascii_case("wal") {
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
    }

    migrate(&conn)?;
    tighten_permissions(path);
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    // BEGIN IMMEDIATE takes the write lock BEFORE the version is read, which
    // is the whole point: the v2 step starts with DROP TABLE transactions, so
    // two processes that both probe "version 0" on a fresh database would
    // both run it and destroy each other's rows. The CLI's migrate() has
    // always done this (sqlite-store.ts); this is the Rust port catching up.
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| format!("Failed to acquire the state write lock: {}", e))?;
    match migrate_locked(conn) {
        Ok(()) => conn
            .execute_batch("COMMIT")
            .map_err(|e| format!("Failed to commit migration: {}", e)),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

/// Migration body, run with the write lock held.
fn migrate_locked(conn: &Connection) -> Result<(), String> {
    let schema = schema();
    conn.execute("CREATE TABLE IF NOT EXISTS meta (schema_version INTEGER NOT NULL)", [])
        .map_err(|e| format!("Failed to create meta table: {}", e))?;

    // A missing ROW means a genuinely fresh database. Any other error means we
    // do not KNOW the version — and assuming 0 would run the destructive v2
    // step, turning a transient failure into permanent data loss. Refuse
    // instead; a read that returns an error is recoverable, a dropped ledger
    // is not.
    let mut meta_missing = false;
    let current: i64 = match conn.query_row("SELECT schema_version FROM meta", [], |row| row.get(0))
    {
        Ok(version) => version,
        // No version ROW is ambiguous: a genuinely fresh database looks
        // identical to one whose meta was lost. Ask the tables themselves
        // before believing 0, because believing 0 runs DROP TABLE
        // transactions and takes every rollback point with it.
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            meta_missing = true;
            detect_version(conn)
        }
        Err(error) => {
            return Err(format!(
                "Refusing to migrate: could not read the schema version ({}). \
                 The database is left untouched.",
                error
            ))
        }
    };

    // A database newer than this build is left alone rather than "migrated"
    // backwards. Reads and inserts still work because the schema is additive;
    // an older app writing a newer ledger is better than one rewriting it.
    if current >= schema.version {
        // But if the version was INFERRED because meta had no row, repair it.
        // Detecting a damaged meta and leaving it damaged just hands the next
        // process — usually the CLI, which opens this far more often — the
        // same landmine.
        if meta_missing {
            conn.execute("DELETE FROM meta", [])
                .map_err(|e| format!("Failed to reset meta: {}", e))?;
            conn.execute("INSERT INTO meta (schema_version) VALUES (?1)", [current])
                .map_err(|e| format!("Failed to repair schema version: {}", e))?;
        }
        return Ok(());
    }

    for version in (current + 1)..=schema.version {
        // A version with no statements would stamp meta as migrated while
        // creating nothing, and every later open would skip the migration
        // forever. Refuse rather than record a lie about the schema.
        let statements = schema
            .migrations
            .get(&version.to_string())
            .ok_or_else(|| format!("No migration defined for schema v{}", version))?;
        for statement in statements {
            conn.execute_batch(statement)
                .map_err(|e| format!("Migration to v{} failed: {}", version, e))?;
        }
    }
    if current == 0 {
        conn.execute("DELETE FROM meta", [])
            .map_err(|e| format!("Failed to reset meta: {}", e))?;
        conn.execute("INSERT INTO meta (schema_version) VALUES (?1)", [schema.version])
    } else {
        conn.execute("UPDATE meta SET schema_version = ?1", [schema.version])
    }
    .map_err(|e| format!("Failed to record schema version: {}", e))?;
    Ok(())
}

/// Longest accepted value for any single string field.
const MAX_FIELD_BYTES: usize = 4096;
/// Most entries accepted in any one list field.
const MAX_LIST_ENTRIES: usize = 256;

/// Bound what a webview can put in the ledger.
///
/// Every field here arrives from JS. Unbounded, one call could write hundreds
/// of megabytes into a database the CLI later materializes in full for
/// `rollback --list`. The rest of the codebase caps untrusted input the same
/// way (MAX_STORE_FILE_BYTES, the capsule limits); this was the outlier.
fn validate_record(record: &TransactionRecord) -> Result<(), String> {
    let fields = [
        ("transactionId", &record.transaction_id),
        ("appliedAt", &record.applied_at),
        ("manifestPath", &record.manifest_path),
        ("manifestRoot", &record.manifest_root),
        ("backupDir", &record.backup_dir),
    ];
    for (name, value) in fields {
        if value.len() > MAX_FIELD_BYTES {
            return Err(format!("{} exceeds {} bytes", name, MAX_FIELD_BYTES));
        }
    }
    if record.transaction_id.trim().is_empty() {
        return Err("transactionId must not be empty".to_string());
    }
    for (name, list) in [
        ("roots", &record.roots),
        ("surfaces", &record.surfaces),
        ("kinds", &record.kinds),
        ("identityKeys", &record.identity_keys),
    ] {
        if list.len() > MAX_LIST_ENTRIES {
            return Err(format!("{} exceeds {} entries", name, MAX_LIST_ENTRIES));
        }
        if let Some(entry) = list.iter().find(|entry| entry.len() > MAX_FIELD_BYTES) {
            return Err(format!("{} entry exceeds {} bytes: {}", name, MAX_FIELD_BYTES, &entry[..64.min(entry.len())]));
        }
    }
    Ok(())
}

/// Keep the shared database owner-only, as the CLI does.
///
/// The CLI creates `~/.harness` at 0700 and the db at 0600; Rust was leaving
/// 0755/0644. That bites exactly the user this bridge exists for — the
/// desktop-only user who never runs the CLI — and the ledger's sibling tables
/// hold canonicalized config. Best effort: meaningless on Windows, and a
/// failure here must not fail a write.
fn tighten_permissions(path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Some(parent) = path.parent() {
            let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
        }
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
}

/// Best-effort array-of-strings extraction, independent of sibling fields.
/// Only the (test-only) read path needs it.
#[cfg(test)]
fn string_array(document: &serde_json::Value, key: &str) -> Vec<String> {
    document
        .get(key)
        .and_then(|value| value.as_array())
        .map(|items| items.iter().filter_map(|i| i.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Infer the schema version from what actually exists on disk. Probes are
/// ordered highest-first; the first that matches wins, and none matching means
/// a genuinely empty database.
fn detect_version(conn: &Connection) -> i64 {
    for probe in &schema().version_probes {
        let matched: i64 = conn.query_row(&probe.sql, [], |row| row.get(0)).unwrap_or(0);
        if matched > 0 {
            return probe.version;
        }
    }
    0
}

/// Record one committed transaction as a rollback point (AC-32).
/// Recording the same transaction id twice is idempotent — the later wins.
// ── Drift acknowledgements (AC-37) ─────────────────────────────
//
// These lived in the desktop's own comparator.db while Drift was a separate
// page. Absorbing Drift into the Machine view means both surfaces read the
// same acknowledgements, so they move to the shared harness.db alongside the
// ledger.
//
// The migration COPIES; it never deletes the source rows. If this proves
// wrong in some way not caught here, the originals are still on disk and a
// user has lost nothing — which matters more than tidiness for data the user
// created by hand.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DriftAck {
    pub scope_root: String,
    pub adapter: String,
    pub path: String,
    pub harness_name: String,
    pub slot: String,
    pub acknowledged_at: String,
}

/// Cap the migration so a corrupt or hostile source database cannot make the
/// app hang on launch. Far above any plausible acknowledgement count.
const MAX_MIGRATED_ACKS: usize = 10_000;

#[tauri::command]
pub fn acknowledge_drift(ack: DriftAck) -> Result<(), String> {
    acknowledge_drift_at(&state_path()?, ack)
}

pub(crate) fn acknowledge_drift_at(path: &std::path::Path, ack: DriftAck) -> Result<(), String> {
    let conn = open_at(path)?;
    conn.execute(
        "INSERT INTO drift_acknowledgements \
           (scope_root, adapter, path, harness_name, slot, acknowledged_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(scope_root, adapter, path, harness_name, slot) \
         DO UPDATE SET acknowledged_at = excluded.acknowledged_at",
        rusqlite::params![
            ack.scope_root,
            ack.adapter,
            ack.path,
            ack.harness_name,
            ack.slot,
            ack.acknowledged_at
        ],
    )
    .map_err(|e| format!("Failed to acknowledge drift: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn unacknowledge_drift(ack: DriftAck) -> Result<(), String> {
    unacknowledge_drift_at(&state_path()?, ack)
}

pub(crate) fn unacknowledge_drift_at(path: &std::path::Path, ack: DriftAck) -> Result<(), String> {
    let conn = open_at(path)?;
    conn.execute(
        "DELETE FROM drift_acknowledgements \
         WHERE scope_root = ?1 AND adapter = ?2 AND path = ?3 \
           AND harness_name = ?4 AND slot = ?5",
        rusqlite::params![ack.scope_root, ack.adapter, ack.path, ack.harness_name, ack.slot],
    )
    .map_err(|e| format!("Failed to withdraw acknowledgement: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_drift_acknowledgements() -> Result<Vec<DriftAck>, String> {
    list_drift_acknowledgements_at(&state_path()?)
}

pub(crate) fn list_drift_acknowledgements_at(
    path: &std::path::Path,
) -> Result<Vec<DriftAck>, String> {
    let conn = open_at(path)?;
    let mut statement = conn
        .prepare(
            "SELECT scope_root, adapter, path, harness_name, slot, acknowledged_at \
             FROM drift_acknowledgements",
        )
        .map_err(|e| format!("Failed to read acknowledgements: {}", e))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DriftAck {
                scope_root: row.get(0)?,
                adapter: row.get(1)?,
                path: row.get(2)?,
                harness_name: row.get(3)?,
                slot: row.get(4)?,
                acknowledged_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to read acknowledgements: {}", e))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("Failed to read an acknowledgement: {}", e))?);
    }
    Ok(out)
}

#[tauri::command]
pub fn migrate_drift_acknowledgements(legacy_db: String) -> Result<usize, String> {
    migrate_drift_acknowledgements_at(&state_path()?, std::path::Path::new(&legacy_db))
}

/// Path-taking core, so tests point at scratch databases without touching the
/// process environment.
pub(crate) fn migrate_drift_acknowledgements_at(
    state: &std::path::Path,
    legacy: &std::path::Path,
) -> Result<usize, String> {
    // No legacy database is the normal case on a fresh install, not an error.
    if !legacy.exists() {
        return Ok(0);
    }
    let source = rusqlite::Connection::open_with_flags(
        legacy,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("Failed to open legacy database: {}", e))?;

    // The table may not exist: a desktop install that never used Drift has a
    // comparator.db without it. That is zero rows to migrate, not a failure.
    let has_table: i64 = source
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'drift_acknowledgements'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to inspect legacy database: {}", e))?;
    if has_table == 0 {
        return Ok(0);
    }

    let mut statement = source
        .prepare(
            "SELECT scope_root, adapter, path, harness_name, slot, acknowledged_at \
             FROM drift_acknowledgements",
        )
        .map_err(|e| format!("Failed to read legacy acknowledgements: {}", e))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DriftAck {
                scope_root: row.get(0)?,
                adapter: row.get(1)?,
                path: row.get(2)?,
                harness_name: row.get(3)?,
                slot: row.get(4)?,
                acknowledged_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to read legacy acknowledgements: {}", e))?;

    let mut pending: Vec<DriftAck> = Vec::new();
    for row in rows {
        let ack = row.map_err(|e| format!("Failed to read a legacy acknowledgement: {}", e))?;
        pending.push(ack);
        if pending.len() >= MAX_MIGRATED_ACKS {
            break;
        }
    }
    drop(statement);
    drop(source);

    let mut target = open_at(state)?;
    let tx = target
        .transaction()
        .map_err(|e| format!("Failed to begin migration: {}", e))?;
    let mut migrated = 0usize;
    for ack in &pending {
        // Idempotent, and the TARGET wins on conflict: a row already in the
        // shared store reflects an acknowledgement made after the move, and
        // re-running the migration must not roll it back to the legacy value.
        let changed = tx
            .execute(
                "INSERT OR IGNORE INTO drift_acknowledgements \
                   (scope_root, adapter, path, harness_name, slot, acknowledged_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    ack.scope_root,
                    ack.adapter,
                    ack.path,
                    ack.harness_name,
                    ack.slot,
                    ack.acknowledged_at
                ],
            )
            .map_err(|e| format!("Failed to migrate an acknowledgement: {}", e))?;
        migrated += changed;
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit migration: {}", e))?;
    Ok(migrated)
}

#[tauri::command]
pub fn record_transaction(record: TransactionRecord) -> Result<(), String> {
    record_transaction_at(&state_path()?, record)
}

/// Path-taking core of {@link record_transaction}. Split out so tests can
/// point at a scratch database WITHOUT mutating the process environment —
/// CI runs `cargo test` without `--test-threads=1`, so an env-mutating test
/// would race every other test in the crate (the hazard PR #364 removed).
pub(crate) fn record_transaction_at(
    path: &std::path::Path,
    record: TransactionRecord,
) -> Result<(), String> {
    validate_record(&record)?;
    let conn = open_at(path)?;
    let payload = serde_json::to_string(&RecordPayload {
        surfaces: record.surfaces,
        kinds: record.kinds,
        identity_keys: record.identity_keys,
    })
    .map_err(|e| format!("Failed to serialize payload: {}", e))?;
    let roots = serde_json::to_string(&record.roots)
        .map_err(|e| format!("Failed to serialize roots: {}", e))?;

    conn.execute(
        "INSERT INTO transactions
           (transaction_id, applied_at, roots, manifest_path, manifest_root, backup_dir, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(transaction_id) DO UPDATE SET
           applied_at = excluded.applied_at,
           roots = excluded.roots,
           manifest_path = excluded.manifest_path,
           manifest_root = excluded.manifest_root,
           backup_dir = excluded.backup_dir,
           payload = excluded.payload",
        rusqlite::params![
            record.transaction_id,
            record.applied_at,
            roots,
            record.manifest_path,
            record.manifest_root,
            record.backup_dir,
            payload
        ],
    )
    .map_err(|e| format!("Failed to record transaction: {}", e))?;
    Ok(())
}

/// Recorded transactions, newest first.
///
/// Deliberately NOT a #[tauri::command], and `cfg(test)` because that leaves
/// it with no production caller at all: nothing in the app reads the ledger —
/// `rollback --list` is a CLI command — and exposing a read over IPC with no
/// caller is attack surface bought for nothing. Re-exposing it later means
/// lifting the cfg and adding the attribute.
#[cfg(test)]
pub(crate) fn list_transactions_at(
    path: &std::path::Path,
    limit: Option<i64>,
) -> Result<Vec<TransactionRecord>, String> {
    // SQLite reads a negative LIMIT as unbounded, so `limit: -1` returned the
    // whole table — wrong the moment a caller treats this as a cap.
    let limit = limit.map(|n| n.max(0));
    let conn = open_at(path)?;
    let sql = format!(
        "SELECT transaction_id, applied_at, roots, manifest_path, manifest_root, backup_dir, payload
           FROM transactions ORDER BY applied_at DESC, id DESC{}",
        if limit.is_some() { " LIMIT ?1" } else { "" }
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare: {}", e))?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<TransactionRecord> {
        let roots: String = row.get(2)?;
        let payload: String = row.get(6)?;
        // Read each member independently: a struct-level parse fails wholesale
        // on one bad field, so a payload with a null `surfaces` blanked
        // surfaces AND kinds AND identityKeys. That is a forward-compat trap
        // the first time this column gains a required field in a later
        // milestone — every older row would read as empty rather than erroring.
        let document: serde_json::Value = serde_json::from_str(&payload).unwrap_or_default();
        let parsed = RecordPayload {
            surfaces: string_array(&document, "surfaces"),
            kinds: string_array(&document, "kinds"),
            identity_keys: string_array(&document, "identityKeys"),
        };
        Ok(TransactionRecord {
            transaction_id: row.get(0)?,
            applied_at: row.get(1)?,
            roots: serde_json::from_str(&roots).unwrap_or_default(),
            manifest_path: row.get(3)?,
            manifest_root: row.get(4)?,
            backup_dir: row.get(5)?,
            surfaces: parsed.surfaces,
            kinds: parsed.kinds,
            identity_keys: parsed.identity_keys,
        })
    };
    let rows = match limit {
        Some(n) => stmt.query_map(rusqlite::params![n], map_row),
        None => stmt.query_map([], map_row),
    }
    .map_err(|e| format!("Failed to query transactions: {}", e))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to read transactions: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch database path. No environment mutation: the path-taking
    /// functions are called directly, so these tests are safe under parallel
    /// execution — `.github/workflows/validate.yml` runs a bare `cargo test`,
    /// even though the repo's own `pnpm test:desktop:rust` adds
    /// `--test-threads=1`.
    fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("harness-state-{}.db", name));
        std::fs::remove_file(&path).ok();
        path
    }

    /// A legacy comparator.db carrying `count` acknowledgements.
    fn legacy_db(name: &str, count: usize) -> PathBuf {
        let path = scratch(name);
        let conn = rusqlite::Connection::open(&path).expect("open legacy");
        conn.execute_batch(
            "CREATE TABLE drift_acknowledgements (
                scope_root TEXT NOT NULL,
                adapter TEXT NOT NULL,
                path TEXT NOT NULL,
                harness_name TEXT NOT NULL,
                slot TEXT NOT NULL,
                acknowledged_at TEXT NOT NULL,
                PRIMARY KEY (scope_root, adapter, path, harness_name, slot)
            )",
        )
        .expect("create legacy table");
        for i in 0..count {
            conn.execute(
                "INSERT INTO drift_acknowledgements VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    "/repo",
                    "claude-code",
                    format!("CLAUDE.md-{}", i),
                    "reviewer",
                    "instructions",
                    "2026-09-01T00:00:00Z"
                ],
            )
            .expect("seed legacy row");
        }
        path
    }

    #[test]
    fn migrates_legacy_acknowledgements_into_the_shared_store() {
        let state = scratch("ack-migrate");
        let legacy = legacy_db("ack-legacy", 3);
        assert_eq!(
            migrate_drift_acknowledgements_at(&state, &legacy).unwrap(),
            3
        );
        let conn = open_at(&state).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM drift_acknowledgements", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn migration_is_idempotent_and_never_deletes_the_source() {
        let state = scratch("ack-idem");
        let legacy = legacy_db("ack-idem-legacy", 2);
        assert_eq!(migrate_drift_acknowledgements_at(&state, &legacy).unwrap(), 2);
        // A second run migrates nothing new and does not duplicate.
        assert_eq!(migrate_drift_acknowledgements_at(&state, &legacy).unwrap(), 0);
        let conn = open_at(&state).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM drift_acknowledgements", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);

        // The legacy rows are still there: if this migration is wrong in some
        // way, the user's own data is recoverable.
        let source = rusqlite::Connection::open(&legacy).unwrap();
        let remaining: i64 = source
            .query_row("SELECT COUNT(*) FROM drift_acknowledgements", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining, 2);
    }

    #[test]
    fn a_newer_acknowledgement_in_the_shared_store_wins() {
        // Re-running the migration must not roll an acknowledgement back to
        // whatever the abandoned database happened to hold.
        let state = scratch("ack-newer");
        let legacy = legacy_db("ack-newer-legacy", 1);
        migrate_drift_acknowledgements_at(&state, &legacy).unwrap();
        let conn = open_at(&state).unwrap();
        conn.execute(
            "UPDATE drift_acknowledgements SET acknowledged_at = '2026-12-25T00:00:00Z'",
            [],
        )
        .unwrap();
        drop(conn);

        migrate_drift_acknowledgements_at(&state, &legacy).unwrap();
        let conn = open_at(&state).unwrap();
        let stamp: String = conn
            .query_row("SELECT acknowledged_at FROM drift_acknowledgements", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stamp, "2026-12-25T00:00:00Z");
    }

    #[test]
    fn a_missing_or_driftless_legacy_database_is_zero_rows_not_an_error() {
        let state = scratch("ack-missing");
        // Fresh install: no comparator.db at all.
        assert_eq!(
            migrate_drift_acknowledgements_at(&state, &scratch("ack-absent")).unwrap(),
            0
        );
        // Installed, but Drift was never used: the table does not exist.
        let bare = scratch("ack-bare");
        rusqlite::Connection::open(&bare)
            .unwrap()
            .execute_batch("CREATE TABLE comparisons (id TEXT)")
            .unwrap();
        assert_eq!(migrate_drift_acknowledgements_at(&state, &bare).unwrap(), 0);
    }

    fn record(id: &str) -> TransactionRecord {
        TransactionRecord {
            transaction_id: id.to_string(),
            applied_at: "2026-09-01T10:00:00.000Z".to_string(),
            roots: vec!["home".to_string()],
            manifest_path: ".harness/backups/ts/transaction.json".to_string(),
            manifest_root: "/Users/tester".to_string(),
            backup_dir: ".harness/backups/ts".to_string(),
            surfaces: vec!["cursor".to_string()],
            kinds: vec!["mcp-server".to_string()],
            identity_keys: vec!["mcp-server:postgres".to_string()],
        }
    }

    #[test]
    fn creates_the_database_from_nothing_at_the_current_version() {
        let path = scratch("create");
        // A desktop-only user has no CLI run to make the file.
        record_transaction_at(&path, record("first")).unwrap();
        let conn = Connection::open(&path).unwrap();
        let version: i64 = conn
            .query_row("SELECT schema_version FROM meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, schema().version);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn round_trips_a_record() {
        let path = scratch("roundtrip");
        record_transaction_at(&path, record("rt")).unwrap();
        let listed = list_transactions_at(&path, None).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].transaction_id, "rt");
        assert_eq!(listed[0].roots, vec!["home".to_string()]);
        assert_eq!(listed[0].surfaces, vec!["cursor".to_string()]);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn is_idempotent_on_the_same_transaction_id() {
        let path = scratch("idempotent");
        record_transaction_at(&path, record("dup")).unwrap();
        let mut second = record("dup");
        second.surfaces = vec!["codex".to_string()];
        record_transaction_at(&path, second).unwrap();
        let listed = list_transactions_at(&path, None).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].surfaces, vec!["codex".to_string()]);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn migrates_a_v1_database_in_place() {
        let path = scratch("v1");
        // The M1 placeholder shape, as a CLI at v1 would have left it.
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE meta (schema_version INTEGER NOT NULL);
             INSERT INTO meta (schema_version) VALUES (1);
             CREATE TABLE transactions (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL);",
        )
        .unwrap();
        drop(conn);

        record_transaction_at(&path, record("migrated")).unwrap();
        assert_eq!(list_transactions_at(&path, None).unwrap().len(), 1);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn writes_a_row_the_cli_schema_can_read() {
        // End-to-end shape check: a desktop-recorded row must sit in the same
        // table, with the same column names, that the CLI's listTransactions
        // selects from. If the generated schema drifted, this reads garbage.
        let path = scratch("cli-shape");
        record_transaction_at(&path, record("shared")).unwrap();

        let conn = Connection::open(&path).unwrap();
        let (id, roots, manifest_root, payload): (String, String, String, String) = conn
            .query_row(
                "SELECT transaction_id, roots, manifest_root, payload FROM transactions",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(id, "shared");
        assert_eq!(roots, r#"["home"]"#);
        assert_eq!(manifest_root, "/Users/tester");
        // The CLI parses payload as {surfaces, kinds, identityKeys}.
        assert!(payload.contains("\"identityKeys\""));
        assert!(payload.contains("cursor"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn the_embedded_schema_parses_with_probes() {
        // A serde key mismatch deserializes version_probes to an empty Vec in
        // silence, which disables the guard that keeps a read from dropping
        // the ledger. Assert the embedded artifact actually populated.
        assert!(schema().version > 0);
        assert!(!schema().migrations.is_empty());
        assert!(
            !schema().version_probes.is_empty(),
            "version probes failed to deserialize — check the JSON key casing"
        );
    }

    #[test]
    fn one_unreadable_payload_field_does_not_blank_the_others() {
        let path = scratch("payload-leniency");
        record_transaction_at(&path, record("lenient")).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "UPDATE transactions SET payload = ?1",
            [r#"{"surfaces":null,"kinds":["mcp-server"],"identityKeys":["mcp-server:x"]}"#],
        )
        .unwrap();
        drop(conn);

        let listed = list_transactions_at(&path, None).unwrap();
        std::fs::remove_file(&path).ok();
        assert_eq!(listed[0].kinds, vec!["mcp-server".to_string()]);
        assert_eq!(listed[0].identity_keys, vec!["mcp-server:x".to_string()]);
        assert!(listed[0].surfaces.is_empty());
    }

    #[test]
    fn repairs_a_damaged_meta_rather_than_leaving_it() {
        // Detecting the damage and protecting only ourselves hands the same
        // landmine to the CLI, which opens this database far more often.
        let path = scratch("meta-repair");
        record_transaction_at(&path, record("survivor")).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute("DELETE FROM meta", []).unwrap();
        drop(conn);

        list_transactions_at(&path, None).unwrap();

        let conn = Connection::open(&path).unwrap();
        let version: i64 = conn
            .query_row("SELECT schema_version FROM meta", [], |row| row.get(0))
            .expect("meta should have been repaired");
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM meta", [], |row| row.get(0))
            .unwrap();
        drop(conn);
        std::fs::remove_file(&path).ok();
        assert_eq!(version, schema().version);
        assert_eq!(rows, 1);
    }

    #[test]
    fn creates_the_database_owner_only() {
        let path = scratch("perms");
        record_transaction_at(&path, record("perm")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "the shared ledger must not be world-readable");
        }
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn refuses_oversized_webview_input() {
        let path = scratch("caps");
        let mut huge = record("huge");
        huge.manifest_path = "x".repeat(MAX_FIELD_BYTES + 1);
        assert!(record_transaction_at(&path, huge).unwrap_err().contains("manifestPath"));

        let mut many = record("many");
        many.identity_keys = (0..MAX_LIST_ENTRIES + 1).map(|i| i.to_string()).collect();
        assert!(record_transaction_at(&path, many).unwrap_err().contains("identityKeys"));

        let mut empty = record("");
        empty.transaction_id = "  ".to_string();
        assert!(record_transaction_at(&path, empty).is_err());

        // Nothing was written by any of the three.
        assert!(!path.exists() || list_transactions_at(&path, None).unwrap().is_empty());
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn a_negative_limit_is_not_unbounded() {
        let path = scratch("neg-limit");
        for id in ["a", "b", "c"] {
            record_transaction_at(&path, record(id)).unwrap();
        }
        // SQLite treats a negative LIMIT as "no limit"; clamping makes it 0.
        assert!(list_transactions_at(&path, Some(-1)).unwrap().is_empty());
        assert_eq!(list_transactions_at(&path, None).unwrap().len(), 3);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn a_read_never_destroys_the_ledger() {
        // migrate() runs on every open, including list_transactions, and the
        // v2 step begins with DROP TABLE transactions. If the version probe
        // treats a read FAILURE as "version 0", a transient lock timeout or a
        // meta table with no rows turns a read into permanent data loss.
        let path = scratch("read-safety");
        record_transaction_at(&path, record("keep-me")).unwrap();
        record_transaction_at(&path, record("keep-me-too")).unwrap();

        // Simulate the state a crash between CREATE TABLE meta and COMMIT
        // leaves behind: the table exists, but carries no version row.
        let conn = Connection::open(&path).unwrap();
        conn.execute("DELETE FROM meta", []).unwrap();
        drop(conn);

        let listed = list_transactions_at(&path, None);
        let conn = Connection::open(&path).unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM transactions", [], |row| row.get(0))
            .unwrap_or(-1);
        std::fs::remove_file(&path).ok();
        assert_eq!(remaining, 2, "a read destroyed rollback points; list result was {:?}", listed);
    }

    #[test]
    fn concurrent_cold_starts_do_not_lose_rows() {
        // Two processes racing a fresh database both probe "version 0" and
        // both run the destructive v2 step unless the probe happens under the
        // write lock. The CLI takes BEGIN IMMEDIATE first; Rust must match.
        let path = scratch("cold-race");
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let path = path.clone();
                let barrier = std::sync::Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    record_transaction_at(&path, record(&format!("racer-{}", i)))
                })
            })
            .collect();
        let errors: Vec<String> = handles
            .into_iter()
            .filter_map(|h| h.join().unwrap().err())
            .collect();

        let conn = Connection::open(&path).unwrap();
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM transactions", [], |row| row.get(0))
            .unwrap();
        let meta_rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM meta", [], |row| row.get(0))
            .unwrap();
        drop(conn);
        std::fs::remove_file(&path).ok();

        assert_eq!(meta_rows, 1, "duplicate meta rows from a migration race");
        assert_eq!(rows, 8 - errors.len() as i64, "rows lost to a migration race: {:?}", errors);
    }

    #[test]
    fn honours_a_limit_and_orders_newest_first() {
        let path = scratch("limit");
        for (id, at) in [("old", "2026-09-01T09:00:00.000Z"), ("new", "2026-09-01T11:00:00.000Z")] {
            let mut entry = record(id);
            entry.applied_at = at.to_string();
            record_transaction_at(&path, entry).unwrap();
        }
        let listed = list_transactions_at(&path, Some(1)).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].transaction_id, "new");
        std::fs::remove_file(&path).ok();
    }
}

#[cfg(test)]
mod cross_impl {
    use super::*;

    /// Assert Rust builds the schema the shared source describes.
    ///
    /// The TS drift guard proves `generated == core`, and the CLI applies
    /// core directly — so this closes the last link: that Rust *executes*
    /// those statements faithfully rather than merely embedding them. An
    /// earlier version of this test only EMITTED a database for a manual
    /// diff and was `#[ignore]`d, which meant the agreement was verified once
    /// by hand and then asserted in a commit message. This runs in CI.
    #[test]
    fn builds_the_schema_the_shared_source_describes() {
        let path = std::env::temp_dir().join("harness-state-cross-impl.db");
        std::fs::remove_file(&path).ok();
        record_transaction_at(
            &path,
            TransactionRecord {
                transaction_id: "cross".to_string(),
                applied_at: "2026-09-01T10:00:00.000Z".to_string(),
                roots: vec!["home".to_string()],
                manifest_path: ".harness/backups/x/transaction.json".to_string(),
                manifest_root: "/Users/tester".to_string(),
                backup_dir: ".harness/backups/x".to_string(),
                surfaces: vec!["cursor".to_string()],
                kinds: vec!["mcp-server".to_string()],
                identity_keys: vec!["mcp-server:postgres".to_string()],
            },
        )
        .unwrap();

        let conn = Connection::open(&path).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap();
        let objects: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        // Every table and index the shared migrations define, and nothing the
        // v1 placeholder left behind.
        for expected in [
            "definitions_cache",
            "fingerprints",
            "idx_observed_resources_observation",
            "meta",
            "observations",
            "observed_resources",
            "plugin_installs",
            "transactions",
            "transactions_applied_at",
        ] {
            assert!(objects.contains(&expected.to_string()), "missing {} in {:?}", expected, objects);
        }

        // The v2 ledger shape, not the v1 placeholder.
        let ddl: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name = 'transactions'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(ddl.contains("transaction_id"), "transactions is still the v1 placeholder");
        assert!(ddl.contains("UNIQUE"), "the transaction_id uniqueness constraint was lost");

        drop(stmt);
        drop(conn);
        std::fs::remove_file(&path).ok();
    }
}
