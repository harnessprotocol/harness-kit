use crate::db::Db;
use tauri::State;

// ── Input / output types ─────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffInput {
    pub file_path: String,
    pub diff_text: String,
    pub change_type: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffRow {
    pub id: i64,
    pub comparison_id: String,
    pub panel_id: String,
    pub file_path: String,
    pub diff_text: String,
    pub change_type: String,
}

// ── Panel CRUD ───────────────────────────────────────────────

#[tauri::command]
pub fn save_panel(
    db: State<'_, Db>,
    id: String,
    comparison_id: String,
    harness_id: String,
    harness_name: String,
    model: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO panels (id, comparison_id, harness_id, harness_name, model, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'running')",
        rusqlite::params![id, comparison_id, harness_id, harness_name, model],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_panel_result(
    db: State<'_, Db>,
    comparison_id: String,
    panel_id: String,
    exit_code: Option<i32>,
    duration_ms: Option<i64>,
    status: String,
) -> Result<(), String> {
    const VALID_PANEL_STATUSES: &[&str] = &["running", "completed", "failed", "cancelled"];
    if !VALID_PANEL_STATUSES.contains(&status.as_str()) {
        return Err(format!(
            "Invalid status: {}. Must be one of: running, completed, failed, cancelled",
            status
        ));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE panels SET exit_code = ?1, duration_ms = ?2, status = ?3
         WHERE comparison_id = ?4 AND id = ?5",
        rusqlite::params![exit_code, duration_ms, status, comparison_id, panel_id],
    )
    .map_err(|e| e.to_string())?;

    if conn.changes() == 0 {
        return Err(format!("Panel not found: {}", panel_id));
    }

    Ok(())
}

// ── File diffs ───────────────────────────────────────────────

#[tauri::command]
pub fn save_file_diffs(
    db: State<'_, Db>,
    comparison_id: String,
    panel_id: String,
    diffs: Vec<FileDiffInput>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO file_diffs (comparison_id, panel_id, file_path, diff_text, change_type)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| e.to_string())?;

        for diff in &diffs {
            stmt.execute(rusqlite::params![
                comparison_id,
                panel_id,
                diff.file_path,
                diff.diff_text,
                diff.change_type,
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_comparison_diffs(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<Vec<FileDiffRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, comparison_id, panel_id, file_path, diff_text, change_type
             FROM file_diffs WHERE comparison_id = ?1
             ORDER BY panel_id, file_path",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![comparison_id], |row| {
            Ok(FileDiffRow {
                id: row.get(0)?,
                comparison_id: row.get(1)?,
                panel_id: row.get(2)?,
                file_path: row.get(3)?,
                diff_text: row.get(4)?,
                change_type: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn get_panel_diffs(
    db: State<'_, Db>,
    comparison_id: String,
    panel_id: String,
) -> Result<Vec<FileDiffRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, comparison_id, panel_id, file_path, diff_text, change_type
             FROM file_diffs WHERE comparison_id = ?1 AND panel_id = ?2
             ORDER BY file_path",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![comparison_id, panel_id], |row| {
            Ok(FileDiffRow {
                id: row.get(0)?,
                comparison_id: row.get(1)?,
                panel_id: row.get(2)?,
                file_path: row.get(3)?,
                diff_text: row.get(4)?,
                change_type: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
