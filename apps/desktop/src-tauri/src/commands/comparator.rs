use crate::db::Db;
use serde::Serialize;
use tauri::State;

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
        "INSERT OR REPLACE INTO comparisons (id, title, prompt, working_dir, pinned_commit, created_at, status)
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

    Ok(())
}

#[tauri::command]
pub fn update_comparison_status(
    db: State<'_, Db>,
    id: String,
    status: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE comparisons SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, id],
    )
    .map_err(|e| e.to_string())?;

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
