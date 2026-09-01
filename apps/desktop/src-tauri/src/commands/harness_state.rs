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
struct StateSchema {
    version: i64,
    /// Keyed by the version each step produces, as strings (JSON object keys).
    migrations: BTreeMap<String, Vec<String>>,
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

#[derive(Debug, Serialize, Deserialize)]
struct RecordPayload {
    surfaces: Vec<String>,
    kinds: Vec<String>,
    #[serde(rename = "identityKeys")]
    identity_keys: Vec<String>,
}

/// Resolve the shared db path the same way the CLI does, `HARNESS_STATE_PATH`
/// included — if the two disagreed, the app would write a ledger the CLI's
/// `rollback --list` never reads.
fn state_path() -> Result<PathBuf, String> {
    if let Ok(override_path) = std::env::var("HARNESS_STATE_PATH") {
        let trimmed = override_path.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
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
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to enable WAL: {}", e))?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let schema = schema();
    conn.execute("CREATE TABLE IF NOT EXISTS meta (schema_version INTEGER NOT NULL)", [])
        .map_err(|e| format!("Failed to create meta table: {}", e))?;
    let current: i64 = conn
        .query_row("SELECT schema_version FROM meta", [], |row| row.get(0))
        .unwrap_or(0);
    if current >= schema.version {
        return Ok(());
    }

    let tx = conn.unchecked_transaction().map_err(|e| format!("Failed to begin: {}", e))?;
    for version in (current + 1)..=schema.version {
        for statement in schema.migrations.get(&version.to_string()).into_iter().flatten() {
            tx.execute_batch(statement)
                .map_err(|e| format!("Migration to v{} failed: {}", version, e))?;
        }
    }
    if current == 0 {
        tx.execute("INSERT INTO meta (schema_version) VALUES (?1)", [schema.version])
    } else {
        tx.execute("UPDATE meta SET schema_version = ?1", [schema.version])
    }
    .map_err(|e| format!("Failed to record schema version: {}", e))?;
    tx.commit().map_err(|e| format!("Failed to commit migration: {}", e))
}

/// Record one committed transaction as a rollback point (AC-32).
/// Recording the same transaction id twice is idempotent — the later wins.
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
#[tauri::command]
pub fn list_transactions(limit: Option<i64>) -> Result<Vec<TransactionRecord>, String> {
    list_transactions_at(&state_path()?, limit)
}

/// Path-taking core of {@link list_transactions}; see record_transaction_at.
pub(crate) fn list_transactions_at(
    path: &std::path::Path,
    limit: Option<i64>,
) -> Result<Vec<TransactionRecord>, String> {
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
        let parsed: RecordPayload = serde_json::from_str(&payload).unwrap_or(RecordPayload {
            surfaces: vec![],
            kinds: vec![],
            identity_keys: vec![],
        });
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
    /// functions are called directly, so these tests are safe under the
    /// parallel `cargo test` CI actually runs.
    fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("harness-state-{}.db", name));
        std::fs::remove_file(&path).ok();
        path
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
