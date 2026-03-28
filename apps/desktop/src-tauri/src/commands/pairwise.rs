use crate::db::Db;
use tauri::State;

pub use super::types::{EvaluationSession, PairwiseVote};

const VALID_DIMENSIONS: &[&str] = &[
    "correctness", "completeness", "codeQuality", "efficiency",
    "reasoning", "safety", "contextAwareness", "autonomy", "adherence",
];

// ── Session commands ─────────────────────────────────────────

#[tauri::command]
pub fn create_evaluation_session(
    db: State<'_, Db>,
    id: String,
    comparison_id: String,
    blind_order: Option<String>,
) -> Result<EvaluationSession, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM evaluation_sessions WHERE id = ?1",
            rusqlite::params![id],
            |_| Ok(true),
        )
        .ok()
        .unwrap_or(false);

    if exists {
        return Err(format!("Evaluation session {} already exists", id));
    }

    conn.execute(
        "INSERT INTO evaluation_sessions (id, comparison_id, eval_method, blind_order, revealed_at, created_at)
         VALUES (?1, ?2, 'pairwise', ?3, NULL, ?4)",
        rusqlite::params![id, comparison_id, blind_order, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(EvaluationSession {
        id,
        comparison_id,
        eval_method: "pairwise".into(),
        blind_order,
        revealed_at: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn get_evaluation_session(
    db: State<'_, Db>,
    comparison_id: String,
) -> Result<Option<EvaluationSession>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, comparison_id, eval_method, blind_order, revealed_at, created_at
         FROM evaluation_sessions WHERE comparison_id = ?1
         ORDER BY created_at DESC LIMIT 1",
        rusqlite::params![comparison_id],
        |row| {
            Ok(EvaluationSession {
                id: row.get(0)?,
                comparison_id: row.get(1)?,
                eval_method: row.get(2)?,
                blind_order: row.get(3)?,
                revealed_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    );

    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn reveal_evaluation_session(
    db: State<'_, Db>,
    session_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE evaluation_sessions SET revealed_at = ?1 WHERE id = ?2",
        rusqlite::params![now, session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Vote commands ─────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn save_pairwise_vote(
    db: State<'_, Db>,
    id: String,
    comparison_id: String,
    session_id: String,
    left_panel_id: String,
    right_panel_id: String,
    dimension: String,
    result: String,
) -> Result<(), String> {
    if id.is_empty() || comparison_id.is_empty() || session_id.is_empty()
        || left_panel_id.is_empty() || right_panel_id.is_empty()
        || dimension.is_empty()
    {
        return Err("All fields are required".to_string());
    }

    // Validate result value
    if !["left", "right", "tie"].contains(&result.as_str()) {
        return Err(format!("Invalid result: {}. Must be 'left', 'right', or 'tie'", result));
    }

    if !VALID_DIMENSIONS.contains(&dimension.as_str()) {
        return Err(format!("Invalid dimension: {}", dimension));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO pairwise_votes
         (id, comparison_id, session_id, left_panel_id, right_panel_id, dimension, result, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, comparison_id, session_id, left_panel_id, right_panel_id, dimension, result, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_pairwise_votes(
    db: State<'_, Db>,
    session_id: String,
) -> Result<Vec<PairwiseVote>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, comparison_id, session_id, left_panel_id, right_panel_id, dimension, result, created_at
             FROM pairwise_votes WHERE session_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let votes = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok(PairwiseVote {
                id: row.get(0)?,
                comparison_id: row.get(1)?,
                session_id: row.get(2)?,
                left_panel_id: row.get(3)?,
                right_panel_id: row.get(4)?,
                dimension: row.get(5)?,
                result: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(votes)
}

// ── Elo analytics ─────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairwiseAnalytics {
    pub total_votes: u64,
    pub elo_rankings: Vec<EloEntry>,
    pub dimension_win_rates: Vec<DimensionWinRate>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EloEntry {
    pub panel_id: String,
    pub harness_name: String,
    pub elo: f64,
    pub wins: u64,
    pub losses: u64,
    pub ties: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionWinRate {
    pub panel_id: String,
    pub harness_name: String,
    pub dimension: String,
    pub wins: u64,
    pub total: u64,
    pub rate: f64,
}

const ELO_K: f64 = 32.0;
const ELO_BASE: f64 = 1500.0;

#[tauri::command]
pub fn get_pairwise_analytics(
    db: State<'_, Db>,
) -> Result<PairwiseAnalytics, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Total votes
    let total_votes: u64 = conn
        .query_row("SELECT COUNT(*) FROM pairwise_votes", [], |row| row.get(0))
        .unwrap_or(0);

    if total_votes == 0 {
        return Ok(PairwiseAnalytics {
            total_votes: 0,
            elo_rankings: vec![],
            dimension_win_rates: vec![],
        });
    }

    // Fetch all votes (for Elo calculation across all comparisons)
    let mut vote_stmt = conn
        .prepare(
            "SELECT v.left_panel_id, v.right_panel_id, v.result, v.dimension,
                    pl.harness_name as left_name, pr.harness_name as right_name
             FROM pairwise_votes v
             JOIN panels pl ON pl.comparison_id = v.comparison_id AND pl.id = v.left_panel_id
             JOIN panels pr ON pr.comparison_id = v.comparison_id AND pr.id = v.right_panel_id
             ORDER BY v.created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    struct VoteRow {
        left_id: String,
        right_id: String,
        result: String,
        dimension: String,
        left_name: String,
        right_name: String,
    }

    let vote_rows: Vec<VoteRow> = vote_stmt
        .query_map([], |row| {
            Ok(VoteRow {
                left_id: row.get(0)?,
                right_id: row.get(1)?,
                result: row.get(2)?,
                dimension: row.get(3)?,
                left_name: row.get(4)?,
                right_name: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Build Elo ratings (keyed by harness_name for cross-comparison aggregation)
    let mut elo_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut win_map: std::collections::HashMap<String, (u64, u64, u64)> = std::collections::HashMap::new(); // (wins, losses, ties)
    let mut panel_to_harness: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for row in &vote_rows {
        let lname = row.left_name.clone();
        let rname = row.right_name.clone();
        panel_to_harness.insert(row.left_id.clone(), lname.clone());
        panel_to_harness.insert(row.right_id.clone(), rname.clone());

        let elo_l = *elo_map.get(&lname).unwrap_or(&ELO_BASE);
        let elo_r = *elo_map.get(&rname).unwrap_or(&ELO_BASE);

        let expected_l = 1.0 / (1.0 + 10_f64.powf((elo_r - elo_l) / 400.0));
        let expected_r = 1.0 - expected_l;

        let (score_l, score_r) = match row.result.as_str() {
            "left" => (1.0, 0.0),
            "right" => (0.0, 1.0),
            _ => (0.5, 0.5), // tie
        };

        elo_map.insert(lname.clone(), elo_l + ELO_K * (score_l - expected_l));
        elo_map.insert(rname.clone(), elo_r + ELO_K * (score_r - expected_r));

        // Track overall wins/losses — update each entry separately to avoid double-borrow
        win_map.entry(lname.clone()).or_insert((0, 0, 0));
        win_map.entry(rname.clone()).or_insert((0, 0, 0));
        match row.result.as_str() {
            "left" => {
                win_map.get_mut(&lname).unwrap().0 += 1;
                win_map.get_mut(&rname).unwrap().1 += 1;
            }
            "right" => {
                win_map.get_mut(&lname).unwrap().1 += 1;
                win_map.get_mut(&rname).unwrap().0 += 1;
            }
            _ => {
                win_map.get_mut(&lname).unwrap().2 += 1;
                win_map.get_mut(&rname).unwrap().2 += 1;
            }
        }
    }

    // Build dimension win rates (per harness_name)
    let mut dim_map: std::collections::HashMap<(String, String), (u64, u64)> = std::collections::HashMap::new();

    for row in &vote_rows {
        let lname = row.left_name.clone();
        let rname = row.right_name.clone();
        let dim = row.dimension.clone();

        // Update each entry separately to avoid double-borrow
        dim_map.entry((lname.clone(), dim.clone())).or_insert((0, 0));
        dim_map.entry((rname.clone(), dim.clone())).or_insert((0, 0));

        dim_map.get_mut(&(lname.clone(), dim.clone())).unwrap().1 += 1;
        dim_map.get_mut(&(rname.clone(), dim.clone())).unwrap().1 += 1;
        match row.result.as_str() {
            "left"  => { dim_map.get_mut(&(lname.clone(), dim.clone())).unwrap().0 += 1; }
            "right" => { dim_map.get_mut(&(rname.clone(), dim.clone())).unwrap().0 += 1; }
            _ => {} // tie counts as neither win
        }
    }

    let mut dimension_win_rates: Vec<DimensionWinRate> = dim_map
        .into_iter()
        .map(|((harness_name, dimension), (wins, total))| DimensionWinRate {
            panel_id: harness_name.clone(),
            harness_name,
            dimension,
            wins,
            total,
            rate: if total > 0 { wins as f64 / total as f64 } else { 0.0 },
        })
        .collect();
    dimension_win_rates.sort_by(|a, b| a.harness_name.cmp(&b.harness_name).then(a.dimension.cmp(&b.dimension)));

    let mut elo_rankings: Vec<EloEntry> = elo_map
        .into_iter()
        .map(|(harness_name, elo)| {
            let (wins, losses, ties) = win_map.get(&harness_name).copied().unwrap_or((0, 0, 0));
            EloEntry {
                panel_id: harness_name.clone(),
                harness_name,
                elo: (elo * 10.0).round() / 10.0,
                wins,
                losses,
                ties,
            }
        })
        .collect();
    elo_rankings.sort_by(|a, b| b.elo.partial_cmp(&a.elo).unwrap_or(std::cmp::Ordering::Equal));

    Ok(PairwiseAnalytics {
        total_votes,
        elo_rankings,
        dimension_win_rates,
    })
}

#[tauri::command]
pub fn delete_pairwise_vote(
    db: State<'_, Db>,
    session_id: String,
    dimension: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM pairwise_votes WHERE session_id = ?1 AND dimension = ?2",
        rusqlite::params![session_id, dimension],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
