use crate::db::Db;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportComparison {
    id: String,
    prompt: String,
    working_dir: String,
    pinned_commit: Option<String>,
    created_at: String,
    status: String,
    panels: Vec<ExportPanel>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportPanel {
    id: String,
    harness_id: String,
    harness_name: String,
    model: Option<String>,
    exit_code: Option<i32>,
    duration_ms: Option<i64>,
    status: String,
    output_text: Option<String>,
    diffs: Vec<ExportDiff>,
    evaluation: Option<ExportEvaluation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportDiff {
    file_path: String,
    diff_text: String,
    change_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportEvaluation {
    correctness: Option<f64>,
    completeness: Option<f64>,
    code_quality: Option<f64>,
    efficiency: Option<f64>,
    reasoning: Option<f64>,
    speed: Option<f64>,
    safety: Option<f64>,
    context_awareness: Option<f64>,
    autonomy: Option<f64>,
    adherence: Option<f64>,
    overall_score: Option<f64>,
    notes: Option<String>,
}

#[tauri::command]
pub fn export_comparison_json(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let comp = conn
        .query_row(
            "SELECT id, prompt, working_dir, pinned_commit, created_at, status FROM comparisons WHERE id = ?1",
            rusqlite::params![comparison_id],
            |row| {
                Ok(ExportComparison {
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

    let mut panel_stmt = conn
        .prepare("SELECT id, harness_id, harness_name, model, exit_code, duration_ms, status, output_text FROM panels WHERE comparison_id = ?1")
        .map_err(|e| e.to_string())?;

    let panels: Vec<ExportPanel> = panel_stmt
        .query_map(rusqlite::params![comparison_id], |row| {
            Ok(ExportPanel {
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

    let mut result = comp;
    for mut panel in panels {
        // Load diffs
        let mut diff_stmt = conn
            .prepare("SELECT file_path, diff_text, change_type FROM file_diffs WHERE comparison_id = ?1 AND panel_id = ?2")
            .map_err(|e| e.to_string())?;

        panel.diffs = diff_stmt
            .query_map(rusqlite::params![comparison_id, panel.id], |row| {
                Ok(ExportDiff {
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
            "SELECT correctness, completeness, code_quality, efficiency, reasoning, speed, safety, context_awareness, autonomy, adherence, overall_score, notes FROM evaluations WHERE comparison_id = ?1 AND panel_id = ?2 LIMIT 1",
            rusqlite::params![comparison_id, panel.id],
            |row| {
                Ok(ExportEvaluation {
                    correctness: row.get(0)?,
                    completeness: row.get(1)?,
                    code_quality: row.get(2)?,
                    efficiency: row.get(3)?,
                    reasoning: row.get(4)?,
                    speed: row.get(5)?,
                    safety: row.get(6)?,
                    context_awareness: row.get(7)?,
                    autonomy: row.get(8)?,
                    adherence: row.get(9)?,
                    overall_score: row.get(10)?,
                    notes: row.get(11)?,
                })
            },
        );
        panel.evaluation = eval.ok();

        result.panels.push(panel);
    }

    serde_json::to_string_pretty(&result).map_err(|e| e.to_string())
}

// ── Analytics ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsData {
    pub total_comparisons: u64,
    pub win_rates: Vec<HarnessWinRate>,
    pub model_win_rates: Vec<ModelWinRate>,
    pub dimension_averages: Vec<DimensionAvg>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessWinRate {
    pub harness_id: String,
    pub harness_name: String,
    pub wins: u64,
    pub total: u64,
    pub rate: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelWinRate {
    pub model: String,
    pub wins: u64,
    pub total: u64,
    pub rate: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionAvg {
    pub harness_id: String,
    pub harness_name: String,
    pub dimension: String,
    pub avg: f64,
}

#[tauri::command]
pub fn get_comparator_analytics(db: State<'_, Db>) -> Result<AnalyticsData, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Total comparisons with evaluations
    let total_comparisons: u64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT comparison_id) FROM evaluations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as u64;

    if total_comparisons == 0 {
        return Ok(AnalyticsData {
            total_comparisons: 0,
            win_rates: vec![],
            model_win_rates: vec![],
            dimension_averages: vec![],
        });
    }

    // Win rates by harness: winner = panel with highest overall_score per comparison
    let mut win_stmt = conn
        .prepare(
            "SELECT p.harness_id, p.harness_name, COUNT(*) as wins
             FROM evaluations e
             JOIN panels p ON p.comparison_id = e.comparison_id AND p.id = e.panel_id
             WHERE e.overall_score = (
                 SELECT MAX(e2.overall_score)
                 FROM evaluations e2
                 WHERE e2.comparison_id = e.comparison_id
             )
             GROUP BY p.harness_id",
        )
        .map_err(|e| e.to_string())?;

    let win_counts: Vec<(String, String, u64)> = win_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? as u64,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Total appearances per harness
    let mut total_stmt = conn
        .prepare(
            "SELECT p.harness_id, COUNT(DISTINCT e.comparison_id)
             FROM evaluations e
             JOIN panels p ON p.comparison_id = e.comparison_id AND p.id = e.panel_id
             GROUP BY p.harness_id",
        )
        .map_err(|e| e.to_string())?;

    let totals: std::collections::HashMap<String, u64> = total_stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u64))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .collect();

    let win_rates: Vec<HarnessWinRate> = win_counts
        .iter()
        .map(|(hid, hname, wins)| {
            let total = totals.get(hid).copied().unwrap_or(1);
            HarnessWinRate {
                harness_id: hid.clone(),
                harness_name: hname.clone(),
                wins: *wins,
                total,
                rate: *wins as f64 / total as f64,
            }
        })
        .collect();

    // Model win rates
    let mut model_win_stmt = conn
        .prepare(
            "SELECT p.model, COUNT(*) as wins
             FROM evaluations e
             JOIN panels p ON p.comparison_id = e.comparison_id AND p.id = e.panel_id
             WHERE p.model IS NOT NULL
             AND e.overall_score = (
                 SELECT MAX(e2.overall_score)
                 FROM evaluations e2
                 WHERE e2.comparison_id = e.comparison_id
             )
             GROUP BY p.model",
        )
        .map_err(|e| e.to_string())?;

    let model_wins: Vec<(String, u64)> = model_win_stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u64)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut model_total_stmt = conn
        .prepare(
            "SELECT p.model, COUNT(DISTINCT e.comparison_id)
             FROM evaluations e
             JOIN panels p ON p.comparison_id = e.comparison_id AND p.id = e.panel_id
             WHERE p.model IS NOT NULL
             GROUP BY p.model",
        )
        .map_err(|e| e.to_string())?;

    let model_totals: std::collections::HashMap<String, u64> = model_total_stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u64)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .collect();

    let model_win_rates: Vec<ModelWinRate> = model_wins
        .iter()
        .map(|(model, wins)| {
            let total = model_totals.get(model).copied().unwrap_or(1);
            ModelWinRate {
                model: model.clone(),
                wins: *wins,
                total,
                rate: *wins as f64 / total as f64,
            }
        })
        .collect();

    // Dimension averages per harness
    let dimensions = [
        "correctness", "completeness", "code_quality", "efficiency",
        "reasoning", "speed", "safety", "context_awareness",
        "autonomy", "adherence",
    ];

    let mut dimension_averages = Vec::new();
    for dim in &dimensions {
        let sql = format!(
            "SELECT p.harness_id, p.harness_name, AVG(e.{dim})
             FROM evaluations e
             JOIN panels p ON p.comparison_id = e.comparison_id AND p.id = e.panel_id
             WHERE e.{dim} IS NOT NULL
             GROUP BY p.harness_id"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<DimensionAvg> = stmt
            .query_map([], |row| {
                Ok(DimensionAvg {
                    harness_id: row.get(0)?,
                    harness_name: row.get(1)?,
                    dimension: dim.to_string(),
                    avg: row.get::<_, f64>(2).unwrap_or(0.0),
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        dimension_averages.extend(rows);
    }

    Ok(AnalyticsData {
        total_comparisons,
        win_rates,
        model_win_rates,
        dimension_averages,
    })
}
