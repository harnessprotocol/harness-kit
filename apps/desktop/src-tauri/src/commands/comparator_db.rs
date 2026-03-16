use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavePanelRequest {
    pub id: String,
    pub harness_id: String,
    pub harness_name: String,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonSummary {
    pub id: String,
    pub prompt: String,
    pub working_dir: String,
    pub pinned_commit: Option<String>,
    pub created_at: String,
    pub status: String,
    pub panels: Vec<PanelSummary>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelSummary {
    pub id: String,
    pub harness_id: String,
    pub harness_name: String,
    pub model: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonDetail {
    pub id: String,
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
    pub output_text: Option<String>,
    pub diffs: Vec<FileDiffRow>,
    pub evaluation: Option<EvaluationRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffRow {
    pub file_path: String,
    pub diff_text: String,
    pub change_type: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationRow {
    pub id: String,
    pub panel_id: String,
    pub correctness: Option<f64>,
    pub completeness: Option<f64>,
    pub code_quality: Option<f64>,
    pub efficiency: Option<f64>,
    pub reasoning: Option<f64>,
    pub speed: Option<f64>,
    pub safety: Option<f64>,
    pub context_awareness: Option<f64>,
    pub autonomy: Option<f64>,
    pub adherence: Option<f64>,
    pub overall_score: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelDiffs {
    pub panel_id: String,
    pub harness_name: String,
    pub diffs: Vec<FileDiffRow>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySetup {
    pub prompt: String,
    pub working_dir: String,
    pub pinned_commit: Option<String>,
    pub panels: Vec<ReplayPanel>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplayPanel {
    pub harness_id: String,
    pub harness_name: String,
    pub model: Option<String>,
}

#[tauri::command]
pub fn save_comparison(
    db: State<'_, Db>,
    id: String,
    prompt: String,
    working_dir: String,
    pinned_commit: Option<String>,
    panels: Vec<SavePanelRequest>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO comparisons (id, prompt, working_dir, pinned_commit, created_at, status) VALUES (?1, ?2, ?3, ?4, ?5, 'running')",
        rusqlite::params![id, prompt, working_dir, pinned_commit, now],
    )
    .map_err(|e| e.to_string())?;

    for panel in &panels {
        conn.execute(
            "INSERT OR REPLACE INTO panels (id, comparison_id, harness_id, harness_name, model, status) VALUES (?1, ?2, ?3, ?4, ?5, 'running')",
            rusqlite::params![panel.id, id, panel.harness_id, panel.harness_name, panel.model],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn save_panel_result(
    db: State<'_, Db>,
    comparison_id: String,
    panel_id: String,
    exit_code: Option<i32>,
    duration_ms: Option<i64>,
    status: String,
    output_text: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE panels SET exit_code = ?1, duration_ms = ?2, status = ?3, output_text = ?4 WHERE comparison_id = ?5 AND id = ?6",
        rusqlite::params![exit_code, duration_ms, status, output_text, comparison_id, panel_id],
    )
    .map_err(|e| e.to_string())?;

    // Check if all panels are done
    let running_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM panels WHERE comparison_id = ?1 AND status = 'running'",
            rusqlite::params![comparison_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if running_count == 0 {
        conn.execute(
            "UPDATE comparisons SET status = 'complete' WHERE id = ?1",
            rusqlite::params![comparison_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_comparisons(
    db: State<'_, Db>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ComparisonSummary>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare("SELECT id, prompt, working_dir, pinned_commit, created_at, status FROM comparisons ORDER BY created_at DESC LIMIT ?1 OFFSET ?2")
        .map_err(|e| e.to_string())?;

    let comparisons: Vec<ComparisonSummary> = stmt
        .query_map(rusqlite::params![limit, offset], |row| {
            Ok(ComparisonSummary {
                id: row.get(0)?,
                prompt: row.get(1)?,
                working_dir: row.get(2)?,
                pinned_commit: row.get(3)?,
                created_at: row.get(4)?,
                status: row.get(5)?,
                panels: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Load panels for each comparison
    let mut result = Vec::new();
    for mut comp in comparisons {
        let mut panel_stmt = conn
            .prepare("SELECT id, harness_id, harness_name, model, exit_code, duration_ms, status FROM panels WHERE comparison_id = ?1")
            .map_err(|e| e.to_string())?;

        comp.panels = panel_stmt
            .query_map(rusqlite::params![comp.id], |row| {
                Ok(PanelSummary {
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

        result.push(comp);
    }

    Ok(result)
}

#[tauri::command]
pub fn get_comparison(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<ComparisonDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut comp = conn
        .query_row(
            "SELECT id, prompt, working_dir, pinned_commit, created_at, status FROM comparisons WHERE id = ?1",
            rusqlite::params![comparison_id],
            |row| {
                Ok(ComparisonDetail {
                    id: row.get(0)?,
                    prompt: row.get(1)?,
                    working_dir: row.get(2)?,
                    pinned_commit: row.get(3)?,
                    created_at: row.get(4)?,
                    status: row.get(5)?,
                    panels: vec![],
                })
            },
        )
        .map_err(|e| format!("Comparison not found: {}", e))?;

    // Load panels with diffs and evaluations
    let mut panel_stmt = conn
        .prepare("SELECT id, harness_id, harness_name, model, exit_code, duration_ms, status, output_text FROM panels WHERE comparison_id = ?1")
        .map_err(|e| e.to_string())?;

    let panels: Vec<PanelDetail> = panel_stmt
        .query_map(rusqlite::params![comparison_id], |row| {
            Ok(PanelDetail {
                id: row.get(0)?,
                harness_id: row.get(1)?,
                harness_name: row.get(2)?,
                model: row.get(3)?,
                exit_code: row.get(4)?,
                duration_ms: row.get(5)?,
                status: row.get(6)?,
                output_text: row.get(7)?,
                diffs: vec![],
                evaluation: None,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for mut panel in panels {
        // Load diffs
        let mut diff_stmt = conn
            .prepare("SELECT file_path, diff_text, change_type FROM file_diffs WHERE comparison_id = ?1 AND panel_id = ?2")
            .map_err(|e| e.to_string())?;

        panel.diffs = diff_stmt
            .query_map(rusqlite::params![comparison_id, panel.id], |row| {
                Ok(FileDiffRow {
                    file_path: row.get(0)?,
                    diff_text: row.get(1)?,
                    change_type: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Load evaluation
        let eval = conn.query_row(
            "SELECT id, panel_id, correctness, completeness, code_quality, efficiency, reasoning, speed, safety, context_awareness, autonomy, adherence, overall_score, notes FROM evaluations WHERE comparison_id = ?1 AND panel_id = ?2 LIMIT 1",
            rusqlite::params![comparison_id, panel.id],
            |row| {
                Ok(EvaluationRow {
                    id: row.get(0)?,
                    panel_id: row.get(1)?,
                    correctness: row.get(2)?,
                    completeness: row.get(3)?,
                    code_quality: row.get(4)?,
                    efficiency: row.get(5)?,
                    reasoning: row.get(6)?,
                    speed: row.get(7)?,
                    safety: row.get(8)?,
                    context_awareness: row.get(9)?,
                    autonomy: row.get(10)?,
                    adherence: row.get(11)?,
                    overall_score: row.get(12)?,
                    notes: row.get(13)?,
                })
            },
        );
        panel.evaluation = eval.ok();

        comp.panels.push(panel);
    }

    Ok(comp)
}

#[tauri::command]
pub fn delete_comparison(db: State<'_, Db>, comparison_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM comparisons WHERE id = ?1",
        rusqlite::params![comparison_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_file_diffs(
    db: State<'_, Db>,
    comparison_id: String,
    panel_id: String,
    diffs: Vec<FileDiffRow>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    for diff in &diffs {
        conn.execute(
            "INSERT INTO file_diffs (comparison_id, panel_id, file_path, diff_text, change_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![comparison_id, panel_id, diff.file_path, diff.diff_text, diff.change_type],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_comparison_diffs(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<Vec<PanelDiffs>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut panel_stmt = conn
        .prepare(
            "SELECT DISTINCT panel_id, harness_name FROM panels WHERE comparison_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let panels: Vec<(String, String)> = panel_stmt
        .query_map(rusqlite::params![comparison_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (panel_id, harness_name) in panels {
        let mut diff_stmt = conn
            .prepare("SELECT file_path, diff_text, change_type FROM file_diffs WHERE comparison_id = ?1 AND panel_id = ?2")
            .map_err(|e| e.to_string())?;

        let diffs = diff_stmt
            .query_map(rusqlite::params![comparison_id, panel_id], |row| {
                Ok(FileDiffRow {
                    file_path: row.get(0)?,
                    diff_text: row.get(1)?,
                    change_type: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        result.push(PanelDiffs {
            panel_id,
            harness_name,
            diffs,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn get_comparison_setup(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<ReplaySetup, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (prompt, working_dir, pinned_commit) = conn
        .query_row(
            "SELECT prompt, working_dir, pinned_commit FROM comparisons WHERE id = ?1",
            rusqlite::params![comparison_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|e| format!("Comparison not found: {}", e))?;

    let mut panel_stmt = conn
        .prepare(
            "SELECT harness_id, harness_name, model FROM panels WHERE comparison_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let panels = panel_stmt
        .query_map(rusqlite::params![comparison_id], |row| {
            Ok(ReplayPanel {
                harness_id: row.get(0)?,
                harness_name: row.get(1)?,
                model: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ReplaySetup {
        prompt,
        working_dir,
        pinned_commit,
        panels,
    })
}
