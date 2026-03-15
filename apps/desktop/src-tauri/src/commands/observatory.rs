use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;

// ── Stats cache types ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivity {
    pub date: String,
    pub message_count: Option<u64>,
    pub session_count: Option<u64>,
    pub tool_call_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyModelTokens {
    pub date: String,
    pub tokens_by_model: Option<HashMap<String, u64>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageEntry {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatsCache {
    pub last_computed_date: Option<String>,
    pub daily_activity: Option<Vec<DailyActivity>>,
    pub daily_model_tokens: Option<Vec<DailyModelTokens>>,
    pub model_usage: Option<HashMap<String, ModelUsageEntry>>,
    pub total_sessions: Option<u64>,
    pub total_messages: Option<u64>,
    pub hour_counts: Option<HashMap<String, u64>>,
}

// ── Session types ─────────────────────────────────────────────

/// Built from history.jsonl grouping — not deserialized directly
#[derive(Debug, Serialize, Clone)]
pub struct SessionSummary {
    pub session_id: String,
    pub project: String,
    pub project_short: String,
    pub first_timestamp: i64,
    pub last_timestamp: i64,
    pub message_count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionFacet {
    pub session_id: String,
    pub underlying_goal: Option<String>,
    pub outcome: Option<String>,
    pub claude_helpfulness: Option<String>,
    pub session_type: Option<String>,
    pub brief_summary: Option<String>,
    pub friction_counts: Option<HashMap<String, u64>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub pid: u64,
    pub session_id: String,
    pub cwd: String,
    pub started_at: Option<i64>,
}

// ── Helpers ───────────────────────────────────────────────────

fn claude_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

// ── Commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn read_stats_cache() -> Result<StatsCache, String> {
    let path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("stats-cache.json");

    if !path.exists() {
        return Err("stats-cache.json not found".to_string());
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read stats-cache.json: {}", e))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse stats-cache.json: {}", e))
}

#[tauri::command]
pub fn list_sessions_summary() -> Result<Vec<SessionSummary>, String> {
    let path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("history.jsonl");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Failed to open history.jsonl: {}", e))?;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct HistoryEntry {
        session_id: Option<String>,
        timestamp: Option<i64>,
        project: Option<String>,
    }

    // project, first_ts, last_ts, count
    let mut sessions: HashMap<String, (String, i64, i64, u64)> = HashMap::new();

    for line in std::io::BufReader::new(file).lines() {
        let line = match line {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };
        let entry: HistoryEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let session_id = match entry.session_id {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };
        let timestamp = entry.timestamp.unwrap_or(0);
        let project = entry.project.unwrap_or_default();

        let rec = sessions
            .entry(session_id)
            .or_insert_with(|| (project.clone(), timestamp, timestamp, 0));

        if timestamp < rec.1 {
            rec.1 = timestamp;
        }
        if timestamp > rec.2 {
            rec.2 = timestamp;
        }
        rec.3 += 1;
        if !project.is_empty() {
            rec.0 = project;
        }
    }

    let mut result: Vec<SessionSummary> = sessions
        .into_iter()
        .map(|(session_id, (project, first, last, count))| {
            let project_short = std::path::Path::new(&project)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_else(|| project.as_str())
                .to_string();
            SessionSummary {
                session_id,
                project,
                project_short,
                first_timestamp: first,
                last_timestamp: last,
                message_count: count,
            }
        })
        .collect();

    result.sort_by(|a, b| b.first_timestamp.cmp(&a.first_timestamp));
    Ok(result)
}

#[tauri::command]
pub fn read_session_facet(session_id: String) -> Result<Option<SessionFacet>, String> {
    let path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("usage-data")
        .join("facets")
        .join(format!("{}.json", session_id));

    if !path.exists() {
        return Ok(None);
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read facet {}: {}", session_id, e))?;

    serde_json::from_str::<SessionFacet>(&contents)
        .map(Some)
        .map_err(|e| format!("Failed to parse facet {}: {}", session_id, e))
}

#[tauri::command]
pub fn list_active_sessions() -> Result<Vec<ActiveSession>, String> {
    let dir = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("sessions");

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    let mut result = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Ok(session) = serde_json::from_str::<ActiveSession>(&contents) {
            result.push(session);
        }
    }

    Ok(result)
}

/// Daily activity derived from history.jsonl — always fresh (not stale like stats-cache)
#[derive(Debug, Serialize, Clone)]
pub struct LiveDailyActivity {
    pub date: String,
    pub message_count: u64,
    pub session_count: u64,
}

#[tauri::command]
pub fn read_live_activity() -> Result<Vec<LiveDailyActivity>, String> {
    let path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("history.jsonl");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Failed to open history.jsonl: {}", e))?;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct HistoryEntry {
        timestamp: Option<i64>,
        session_id: Option<String>,
    }

    // date_str -> (message_count, HashSet<session_id>)
    let mut buckets: HashMap<String, (u64, std::collections::HashSet<String>)> = HashMap::new();

    for line in std::io::BufReader::new(file).lines() {
        let line = match line {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };
        let entry: HistoryEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let ts_ms = match entry.timestamp {
            Some(t) if t > 0 => t,
            _ => continue,
        };
        // Convert ms timestamp to "YYYY-MM-DD"
        let secs = ts_ms / 1000;
        let date = chrono::DateTime::from_timestamp(secs, 0)
            .map(|dt: chrono::DateTime<chrono::Utc>| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        if date.is_empty() {
            continue;
        }
        let bucket = buckets.entry(date).or_insert_with(|| (0, std::collections::HashSet::new()));
        bucket.0 += 1;
        if let Some(sid) = entry.session_id {
            if !sid.is_empty() {
                bucket.1.insert(sid);
            }
        }
    }

    let mut result: Vec<LiveDailyActivity> = buckets
        .into_iter()
        .map(|(date, (msg_count, sessions))| LiveDailyActivity {
            date,
            message_count: msg_count,
            session_count: sessions.len() as u64,
        })
        .collect();

    result.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(result)
}
