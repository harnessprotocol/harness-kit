use crate::db::Db;
use tauri::State;

pub use super::types::Evaluation;

#[tauri::command]
pub fn save_evaluation(
    db: State<'_, Db>,
    id: String,
    comparison_id: String,
    panel_id: String,
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
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO evaluations (id, comparison_id, panel_id, correctness, completeness, code_quality, efficiency, reasoning, speed, safety, context_awareness, autonomy, adherence, overall_score, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        rusqlite::params![id, comparison_id, panel_id, correctness, completeness, code_quality, efficiency, reasoning, speed, safety, context_awareness, autonomy, adherence, overall_score, notes, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_evaluations(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<Vec<Evaluation>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, panel_id, correctness, completeness, code_quality, efficiency, reasoning, speed, safety, context_awareness, autonomy, adherence, overall_score, notes FROM evaluations WHERE comparison_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let evals = stmt
        .query_map(rusqlite::params![comparison_id], |row| {
            Ok(Evaluation {
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
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(evals)
}

#[tauri::command]
pub fn update_evaluation_score(
    db: State<'_, Db>,
    evaluation_id: String,
    dimension: String,
    score: f64,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Validate dimension name to prevent SQL injection
    let valid_dimensions = [
        "correctness", "completeness", "code_quality", "efficiency",
        "reasoning", "speed", "safety", "context_awareness",
        "autonomy", "adherence", "overall_score",
    ];

    if !valid_dimensions.contains(&dimension.as_str()) {
        return Err(format!("Invalid dimension: {}", dimension));
    }

    let sql = format!(
        "UPDATE evaluations SET {} = ?1 WHERE id = ?2",
        dimension
    );

    conn.execute(&sql, rusqlite::params![score, evaluation_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
