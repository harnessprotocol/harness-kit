use serde::{Deserialize, Serialize};

/// Shared file diff type — used by git.rs (returns from diff commands)
/// and comparator_db.rs (persisted to/from SQLite).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffEntry {
    pub file_path: String,
    pub diff_text: String,
    pub change_type: String,
}

/// Shared evaluation type — used by evaluation.rs (CRUD commands)
/// and comparator_db.rs (loaded as part of ComparisonDetail).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
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
