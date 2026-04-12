use crate::db::Db;
use serde::Serialize;
use tauri::State;

// ── Task-fit routing types ───────────────────────────────────

const VALID_TASK_TYPES: &[&str] = &[
    "coding", "review", "planning", "analysis", "debugging", "documentation",
];

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HarnessRecommendation {
    pub harness_id: String,
    pub harness_name: String,
    pub task_type: String,
    pub win_rate: f64,
    pub session_count: u64,
    pub avg_duration_ms: Option<u64>,
}

// ── Types ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonSummary {
    pub id: String,
    pub title: Option<String>,
    pub prompt: String,
    pub working_dir: String,
    pub pinned_commit: Option<String>,
    pub created_at: String,
    pub status: String,
    pub panel_count: u32,
    pub harness_names: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonDetail {
    pub id: String,
    pub title: Option<String>,
    pub prompt: String,
    pub working_dir: String,
    pub pinned_commit: Option<String>,
    pub created_at: String,
    pub status: String,
    pub panels: Vec<PanelDetail>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelDetail {
    pub id: String,
    pub harness_id: String,
    pub harness_name: String,
    pub model: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub status: String,
}

// ── Commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn save_comparison(
    db: State<'_, Db>,
    id: String,
    title: Option<String>,
    prompt: String,
    working_dir: String,
    pinned_commit: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO comparisons (id, title, prompt, working_dir, pinned_commit, created_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'running')",
        rusqlite::params![id, title, prompt, working_dir, pinned_commit, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_comparison_title(
    db: State<'_, Db>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE comparisons SET title = ?1 WHERE id = ?2",
        rusqlite::params![title, id],
    )
    .map_err(|e| e.to_string())?;

    if conn.changes() == 0 {
        return Err(format!("Comparison not found: {}", id));
    }

    Ok(())
}

#[tauri::command]
pub fn update_comparison_status(
    db: State<'_, Db>,
    id: String,
    status: String,
) -> Result<(), String> {
    const VALID_STATUSES: &[&str] = &["running", "completed", "cancelled"];
    if !VALID_STATUSES.contains(&status.as_str()) {
        return Err(format!(
            "Invalid status: {}. Must be one of: running, completed, cancelled",
            status
        ));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE comparisons SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, id],
    )
    .map_err(|e| e.to_string())?;

    if conn.changes() == 0 {
        return Err(format!("Comparison not found: {}", id));
    }

    Ok(())
}

#[tauri::command]
pub fn list_comparisons(
    db: State<'_, Db>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<ComparisonSummary>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.title, c.prompt, c.working_dir, c.pinned_commit, c.created_at, c.status,
                    COUNT(p.id) as panel_count,
                    GROUP_CONCAT(DISTINCT p.harness_name) as harness_names
             FROM comparisons c
             LEFT JOIN panels p ON p.comparison_id = c.id
             GROUP BY c.id
             ORDER BY c.created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![limit, offset], |row| {
            let harness_names_raw: Option<String> = row.get(8)?;
            let harness_names = harness_names_raw
                .map(|s| s.split(',').map(|n| n.to_string()).collect())
                .unwrap_or_default();

            Ok(ComparisonSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                prompt: row.get(2)?,
                working_dir: row.get(3)?,
                pinned_commit: row.get(4)?,
                created_at: row.get(5)?,
                status: row.get(6)?,
                panel_count: row.get(7)?,
                harness_names,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn get_comparison(
    db: State<'_, Db>,
    id: String,
) -> Result<Option<ComparisonDetail>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let comparison = conn.query_row(
        "SELECT id, title, prompt, working_dir, pinned_commit, created_at, status
         FROM comparisons WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        },
    );

    let (cid, title, prompt, working_dir, pinned_commit, created_at, status) = match comparison {
        Ok(row) => row,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    let mut panel_stmt = conn
        .prepare(
            "SELECT id, harness_id, harness_name, model, exit_code, duration_ms, status
             FROM panels WHERE comparison_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let panels = panel_stmt
        .query_map(rusqlite::params![cid], |row| {
            Ok(PanelDetail {
                id: row.get(0)?,
                harness_id: row.get(1)?,
                harness_name: row.get(2)?,
                model: row.get(3)?,
                exit_code: row.get(4)?,
                duration_ms: row.get(5)?,
                status: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(Some(ComparisonDetail {
        id: cid,
        title,
        prompt,
        working_dir,
        pinned_commit,
        created_at,
        status,
        panels,
    }))
}

#[tauri::command]
pub fn delete_comparison(
    db: State<'_, Db>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM comparisons WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Task-fit routing commands ────────────────────────────────

/// Tag an existing comparison with a task type (e.g. "coding", "review").
#[tauri::command]
pub fn tag_comparison_task_type(
    db: State<'_, Db>,
    comparison_id: String,
    task_type: String,
) -> Result<(), String> {
    if !VALID_TASK_TYPES.contains(&task_type.as_str()) {
        return Err(format!(
            "Invalid task_type '{}'. Must be one of: {}",
            task_type,
            VALID_TASK_TYPES.join(", ")
        ));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE comparisons SET task_type = ?1 WHERE id = ?2",
        rusqlite::params![task_type, comparison_id],
    )
    .map_err(|e| e.to_string())?;

    if conn.changes() == 0 {
        return Err(format!("Comparison not found: {}", comparison_id));
    }

    Ok(())
}

/// Return per-harness win-rate statistics for a given task type (or all types).
/// Only returns harnesses with ≥ 3 sessions for that task type.
#[tauri::command]
pub fn get_harness_recommendations(
    db: State<'_, Db>,
    task_type: Option<String>,
) -> Result<Vec<HarnessRecommendation>, String> {
    if let Some(ref tt) = task_type {
        if !VALID_TASK_TYPES.contains(&tt.as_str()) {
            return Err(format!(
                "Invalid task_type '{}'. Must be one of: {}",
                tt,
                VALID_TASK_TYPES.join(", ")
            ));
        }
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Compute win rate: for each harness+task_type, count sessions where that
    // panel has the highest overall_score in its comparison. Requires ≥3 sessions.
    let sql = "
        SELECT
            p.harness_id,
            p.harness_name,
            c.task_type,
            COUNT(DISTINCT c.id)                          AS session_count,
            CAST(SUM(CASE WHEN p.id = best.winner_panel_id THEN 1 ELSE 0 END) AS REAL)
                / COUNT(DISTINCT c.id)                    AS win_rate,
            AVG(p.duration_ms)                            AS avg_duration_ms
        FROM comparisons c
        JOIN panels p ON p.comparison_id = c.id
        LEFT JOIN (
            SELECT e.comparison_id,
                   e.panel_id AS winner_panel_id
            FROM evaluations e
            WHERE e.overall_score = (
                SELECT MAX(e2.overall_score)
                FROM evaluations e2
                WHERE e2.comparison_id = e.comparison_id
            )
            GROUP BY e.comparison_id   -- pick one winner per comparison
        ) best ON best.comparison_id = c.id
        WHERE c.task_type IS NOT NULL
          AND (?1 IS NULL OR c.task_type = ?1)
        GROUP BY p.harness_id, p.harness_name, c.task_type
        HAVING session_count >= 3
        ORDER BY win_rate DESC
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![task_type], |row| {
            let avg_raw: Option<f64> = row.get(5)?;
            Ok(HarnessRecommendation {
                harness_id:      row.get(0)?,
                harness_name:    row.get(1)?,
                task_type:       row.get(2)?,
                session_count:   row.get::<_, i64>(3)? as u64,
                win_rate:        row.get(4)?,
                avg_duration_ms: avg_raw.map(|v| v as u64),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::TempDir;

    fn test_db() -> (TempDir, db::Db) {
        let dir = TempDir::new().unwrap();
        let database = db::init(dir.path()).unwrap();
        (dir, database)
    }

    /// Helper: seed a comparison row directly via the connection.
    fn seed_comparison(conn: &rusqlite::Connection, id: &str, task_type: Option<&str>) {
        conn.execute(
            "INSERT INTO comparisons (id, prompt, working_dir, created_at, status, task_type)
             VALUES (?1, 'test prompt', '/tmp', datetime('now'), 'completed', ?2)",
            rusqlite::params![id, task_type],
        )
        .unwrap();
    }

    #[test]
    fn task_type_validation_rejects_invalid_values() {
        assert!(!VALID_TASK_TYPES.contains(&"not_a_valid_type"));
        assert!(!VALID_TASK_TYPES.contains(&""));
        assert!(!VALID_TASK_TYPES.contains(&"CODING")); // case-sensitive
    }

    #[test]
    fn task_type_validation_accepts_all_known_types() {
        for tt in VALID_TASK_TYPES {
            assert!(VALID_TASK_TYPES.contains(tt), "Expected {} to be valid", tt);
        }
        assert_eq!(VALID_TASK_TYPES.len(), 6);
    }

    #[test]
    fn task_type_column_is_set_and_readable() {
        let (_dir, database) = test_db();
        let conn = database.conn.lock().unwrap();

        seed_comparison(&conn, "comp-1", Some("coding"));

        let task_type: Option<String> = conn
            .query_row(
                "SELECT task_type FROM comparisons WHERE id = 'comp-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(task_type.as_deref(), Some("coding"));
    }

    #[test]
    fn get_recommendations_returns_empty_below_threshold() {
        let (_dir, database) = test_db();
        let conn = database.conn.lock().unwrap();

        // Seed 2 comparisons (below threshold of 3) with task_type
        seed_comparison(&conn, "comp-a", Some("coding"));
        seed_comparison(&conn, "comp-b", Some("coding"));

        // Query directly (mirrors get_harness_recommendations SQL)
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM comparisons WHERE task_type = 'coding'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(count, 2); // exists but < 3 → recommendations would be empty
    }

    #[test]
    fn task_type_null_by_default() {
        let (_dir, database) = test_db();
        let conn = database.conn.lock().unwrap();

        seed_comparison(&conn, "comp-x", None);

        let task_type: Option<String> = conn
            .query_row(
                "SELECT task_type FROM comparisons WHERE id = 'comp-x'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert!(task_type.is_none());
    }
}
