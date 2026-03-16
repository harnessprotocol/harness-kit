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
    ",
    )
    .map_err(|e| format!("Failed to run schema: {}", e))?;

    Ok(Db {
        conn: Mutex::new(conn),
    })
}
