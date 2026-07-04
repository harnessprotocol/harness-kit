use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Db {
    pub conn: Mutex<Connection>,
}

pub fn init(data_dir: &Path) -> Result<Db, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    let db_path = data_dir.join("comparator.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS comparisons (
            id            TEXT PRIMARY KEY,
            prompt        TEXT NOT NULL,
            working_dir   TEXT NOT NULL,
            pinned_commit TEXT,
            created_at    TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'running'
        );

        CREATE TABLE IF NOT EXISTS panels (
            id              TEXT NOT NULL,
            comparison_id   TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
            harness_id      TEXT NOT NULL,
            harness_name    TEXT NOT NULL,
            model           TEXT,
            exit_code       INTEGER,
            duration_ms     INTEGER,
            status          TEXT NOT NULL DEFAULT 'running',
            output_text     TEXT,
            PRIMARY KEY (comparison_id, id)
        );

        CREATE TABLE IF NOT EXISTS evaluations (
            id              TEXT PRIMARY KEY,
            comparison_id   TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
            panel_id        TEXT NOT NULL,
            correctness     REAL,
            completeness    REAL,
            code_quality    REAL,
            efficiency      REAL,
            reasoning       REAL,
            speed           REAL,
            safety          REAL,
            context_awareness REAL,
            autonomy        REAL,
            adherence       REAL,
            overall_score   REAL,
            notes           TEXT,
            created_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_diffs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            comparison_id   TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
            panel_id        TEXT NOT NULL,
            file_path       TEXT NOT NULL,
            diff_text       TEXT NOT NULL,
            change_type     TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_panels_comp ON panels(comparison_id);
        CREATE INDEX IF NOT EXISTS idx_evals_comp ON evaluations(comparison_id);
        CREATE INDEX IF NOT EXISTS idx_diffs_comp ON file_diffs(comparison_id);
        CREATE INDEX IF NOT EXISTS idx_comp_created ON comparisons(created_at);

        CREATE TABLE IF NOT EXISTS audit_log (
            id          TEXT PRIMARY KEY,
            timestamp   TEXT NOT NULL,
            event_type  TEXT NOT NULL,
            category    TEXT NOT NULL,
            summary     TEXT NOT NULL,
            details     TEXT,
            source      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_log(event_type);
        CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_log(category);

        -- Drift-acknowledgement persistence for the Drift page (packages/core's
        -- detectDrift() computes drift live in the webview; this table only
        -- remembers which specific items the user has acknowledged/reviewed).
        -- Superseded the old parity_snapshots/parity_drift tables, which
        -- backed a since-removed config-file-inspection scan keyed to a
        -- hardcoded known_features.json baseline (see commands/parity.rs).
        CREATE TABLE IF NOT EXISTS drift_acknowledgements (
            scope_root      TEXT NOT NULL,
            adapter         TEXT NOT NULL,
            path            TEXT NOT NULL,
            harness_name    TEXT NOT NULL,
            slot            TEXT NOT NULL,
            acknowledged_at TEXT NOT NULL,
            PRIMARY KEY (scope_root, adapter, path, harness_name, slot)
        );

        CREATE TABLE IF NOT EXISTS evaluation_sessions (
            id              TEXT PRIMARY KEY,
            comparison_id   TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
            eval_method     TEXT NOT NULL DEFAULT 'pairwise',
            blind_order     TEXT,
            revealed_at     TEXT,
            created_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_eval_sessions_comp ON evaluation_sessions(comparison_id);

        CREATE TABLE IF NOT EXISTS pairwise_votes (
            id              TEXT PRIMARY KEY,
            comparison_id   TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
            session_id      TEXT NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
            left_panel_id   TEXT NOT NULL,
            right_panel_id  TEXT NOT NULL,
            dimension       TEXT NOT NULL,
            result          TEXT NOT NULL,
            created_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pairwise_votes_comp ON pairwise_votes(comparison_id);
        CREATE INDEX IF NOT EXISTS idx_pairwise_votes_session ON pairwise_votes(session_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pairwise_votes_unique ON pairwise_votes(session_id, dimension);
    ",
    )
    .map_err(|e| format!("Failed to run schema: {}", e))?;

    // Migration: add title column to comparisons
    if let Err(e) = conn.execute_batch("ALTER TABLE comparisons ADD COLUMN title TEXT;") {
        let msg = e.to_string();
        if !msg.contains("duplicate column name") {
            return Err(format!("Migration failed: {}", msg));
        }
    }

    // Migration: add task_type column to comparisons (for task-fit routing)
    if let Err(e) = conn.execute_batch("ALTER TABLE comparisons ADD COLUMN task_type TEXT;") {
        let msg = e.to_string();
        if !msg.contains("duplicate column name") {
            return Err(format!("Migration failed (task_type): {}", msg));
        }
    }

    Ok(Db {
        conn: Mutex::new(conn),
    })
}
