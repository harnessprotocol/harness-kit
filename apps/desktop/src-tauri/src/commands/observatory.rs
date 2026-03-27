use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::HashSet;
use std::io::BufRead;
use walkdir::WalkDir;

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
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub project: String,
    pub project_short: String,
    pub first_timestamp: i64,
    pub last_timestamp: i64,
    pub message_count: u64,
}

/// Facet JSON files on disk use snake_case — no rename needed
#[derive(Debug, Serialize, Deserialize, Clone)]
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

// ── Live stats types ──────────────────────────────────────────

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveStats {
    pub daily_activity: Vec<DailyActivity>,
    pub daily_model_tokens: Vec<DailyModelTokens>,
    pub model_usage: HashMap<String, ModelUsageEntry>,
    pub hour_counts: HashMap<String, u64>,
    pub total_tool_calls: u64,
    pub total_output_tokens: u64,
    pub scanned_files: u64,
    pub scan_duration_ms: u64,
}

// ── Session transcript types ──────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionTranscript {
    pub session_id: String,
    pub entries: Vec<TranscriptEntry>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_tool_calls: u64,
    pub models_used: Vec<String>,
    pub subagent_count: u32,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEntry {
    pub timestamp: Option<String>,
    pub role: String,
    pub model: Option<String>,
    pub tool_names: Vec<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub content_preview: Option<String>,
    pub is_subagent: bool,
}

// ── JSONL deserialization (minimal) ───────────────────────────

#[derive(Deserialize)]
struct JnlEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    timestamp: Option<serde_json::Value>,
    message: Option<JnlMessage>,
}

#[derive(Deserialize)]
struct JnlMessage {
    model: Option<String>,
    usage: Option<JnlUsage>,
    content: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct JnlUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

// ── Helpers ───────────────────────────────────────────────────

fn claude_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

/// Extract (YYYY-MM-DD, hour) from a JSON timestamp value.
/// Handles both ISO 8601 strings and millisecond epoch numbers.
fn extract_date_hour(ts: &serde_json::Value) -> Option<(String, u8)> {
    match ts {
        serde_json::Value::String(s) => {
            if s.len() >= 10 {
                let date = s[..10].to_string();
                let hour = if s.len() >= 13 && s.as_bytes().get(10) == Some(&b'T') {
                    s[11..13].parse::<u8>().unwrap_or(0)
                } else {
                    0
                };
                Some((date, hour))
            } else {
                None
            }
        }
        serde_json::Value::Number(n) => {
            let ms = n.as_i64()?;
            let secs = ms / 1000;
            let dt = chrono::DateTime::from_timestamp(secs, 0)?;
            let date = dt.format("%Y-%m-%d").to_string();
            let hour = dt.format("%H").to_string().parse::<u8>().unwrap_or(0);
            Some((date, hour))
        }
        _ => None,
    }
}

/// Convert a timestamp JSON value to an ISO 8601 string for transcript display.
fn timestamp_to_iso(ts: &serde_json::Value) -> Option<String> {
    match ts {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => {
            let ms = n.as_i64()?;
            let dt = chrono::DateTime::from_timestamp(ms / 1000, 0)?;
            Some(dt.to_rfc3339())
        }
        _ => None,
    }
}

/// Count tool_use blocks in a message content value.
fn count_tool_uses(content: &serde_json::Value) -> u64 {
    match content {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
            .count() as u64,
        _ => 0,
    }
}

/// Extract tool names from a message content value.
fn extract_tool_names(content: &serde_json::Value) -> Vec<String> {
    match content {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|b| {
                if b.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    b.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect(),
        _ => vec![],
    }
}

/// Truncate a string to at most `max_chars` characters (safe for multi-byte UTF-8).
fn truncate_chars(s: &str, max_chars: usize) -> String {
    match s.char_indices().nth(max_chars) {
        Some((byte_pos, _)) => s[..byte_pos].to_string(),
        None => s.to_string(),
    }
}

/// Extract first text block as a preview (truncated to max_len characters).
fn content_preview(content: &serde_json::Value, max_len: usize) -> Option<String> {
    match content {
        serde_json::Value::String(s) => Some(truncate_chars(s, max_len)),
        serde_json::Value::Array(arr) => {
            for block in arr {
                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                    if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                        return Some(truncate_chars(text, max_len));
                    }
                }
            }
            None
        }
        _ => None,
    }
}

/// Parse a JSONL transcript file, appending entries to the vec.
fn parse_transcript_file(
    path: &std::path::Path,
    is_subagent: bool,
    entries: &mut Vec<TranscriptEntry>,
) {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };

    for line in std::io::BufReader::new(file).lines() {
        let line = match line {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };

        let entry: JnlEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let role = entry.entry_type.unwrap_or_default();
        let timestamp = entry.timestamp.as_ref().and_then(timestamp_to_iso);

        let (model, tool_names, input_tokens, output_tokens, preview) =
            if let Some(ref msg) = entry.message {
                (
                    msg.model.clone(),
                    msg.content.as_ref().map(extract_tool_names).unwrap_or_default(),
                    msg.usage.as_ref().and_then(|u| u.input_tokens),
                    msg.usage.as_ref().and_then(|u| u.output_tokens),
                    msg.content.as_ref().and_then(|c| content_preview(c, 200)),
                )
            } else {
                (None, vec![], None, None, None)
            };

        entries.push(TranscriptEntry {
            timestamp,
            role,
            model,
            tool_names,
            input_tokens,
            output_tokens,
            content_preview: preview,
            is_subagent,
        });
    }
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
                .unwrap_or(project.as_str())
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
    if session_id.contains('/') || session_id.contains('\\') || session_id.contains("..") {
        return Err("Invalid session ID".to_string());
    }

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
#[serde(rename_all = "camelCase")]
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
    let mut buckets: HashMap<String, (u64, HashSet<String>)> = HashMap::new();

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
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        if date.is_empty() {
            continue;
        }
        let bucket = buckets.entry(date).or_insert_with(|| (0, HashSet::new()));
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

// ── compute_live_stats ────────────────────────────────────────

#[tauri::command]
pub fn compute_live_stats(since_date: Option<String>) -> Result<LiveStats, String> {
    let start_time = std::time::Instant::now();

    let projects_dir = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("projects");

    if !projects_dir.exists() {
        return Ok(LiveStats::default());
    }

    // Determine cutoff: explicit arg > stats-cache lastComputedDate > 30 days ago
    let cutoff = since_date
        .or_else(|| {
            let cache_path = claude_dir()?.join("stats-cache.json");
            let contents = std::fs::read_to_string(&cache_path).ok()?;
            let cache: serde_json::Value = serde_json::from_str(&contents).ok()?;
            cache
                .get("lastComputedDate")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| {
            let ago = chrono::Utc::now() - chrono::Duration::days(30);
            ago.format("%Y-%m-%d").to_string()
        });

    // Convert cutoff to SystemTime for mtime comparison
    let cutoff_system_time: Option<std::time::SystemTime> =
        chrono::NaiveDate::parse_from_str(&cutoff, "%Y-%m-%d")
            .ok()
            .and_then(|nd| nd.and_hms_opt(0, 0, 0))
            .map(|ndt| {
                let ts = ndt.and_utc().timestamp();
                std::time::UNIX_EPOCH + std::time::Duration::from_secs(ts as u64)
            });

    // Aggregation state
    struct DayBucket {
        messages: u64,
        tool_calls: u64,
        files: HashSet<String>,
    }

    let mut daily_map: HashMap<String, DayBucket> = HashMap::new();
    let mut daily_tokens: HashMap<String, HashMap<String, u64>> = HashMap::new();
    let mut model_map: HashMap<String, (u64, u64, u64, u64)> = HashMap::new();
    let mut hour_map: HashMap<u8, u64> = HashMap::new();
    let mut total_tool_calls: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    let mut scanned_files: u64 = 0;

    for entry in WalkDir::new(&projects_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        // Filter by mtime
        if let Some(ref cutoff_time) = cutoff_system_time {
            if let Ok(meta) = entry.metadata() {
                if let Ok(mtime) = meta.modified() {
                    if mtime < *cutoff_time {
                        continue;
                    }
                }
            }
        }

        scanned_files += 1;
        let file_id = entry.path().to_string_lossy().to_string();

        let file = match std::fs::File::open(entry.path()) {
            Ok(f) => f,
            Err(_) => continue,
        };

        for line in std::io::BufReader::new(file).lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };

            // Fast-path: skip lines that aren't assistant entries
            if !line.contains("\"assistant\"") {
                continue;
            }

            let jnl: JnlEntry = match serde_json::from_str(&line) {
                Ok(e) => e,
                Err(_) => continue,
            };

            if jnl.entry_type.as_deref() != Some("assistant") {
                continue;
            }

            let msg = match jnl.message {
                Some(ref m) => m,
                None => continue,
            };

            let (date, hour) = match jnl.timestamp.as_ref().and_then(extract_date_hour) {
                Some(dh) => dh,
                None => continue, // skip entries without parseable timestamps
            };

            // Only aggregate entries strictly after the cutoff to avoid
            // double-counting with cache data
            if date <= cutoff {
                continue;
            }

            let model = msg.model.clone().unwrap_or_default();

            let tool_count = msg.content.as_ref().map(count_tool_uses).unwrap_or(0);

            let (inp, out, cr, cc) = if let Some(ref usage) = msg.usage {
                (
                    usage.input_tokens.unwrap_or(0),
                    usage.output_tokens.unwrap_or(0),
                    usage.cache_read_input_tokens.unwrap_or(0),
                    usage.cache_creation_input_tokens.unwrap_or(0),
                )
            } else {
                (0, 0, 0, 0)
            };

            // Daily activity
            let day = daily_map.entry(date.clone()).or_insert_with(|| DayBucket {
                messages: 0,
                tool_calls: 0,
                files: HashSet::new(),
            });
            day.messages += 1;
            day.tool_calls += tool_count;
            day.files.insert(file_id.clone());

            // Daily tokens by model
            if !model.is_empty() {
                let total = inp + out + cr + cc;
                if total > 0 {
                    *daily_tokens
                        .entry(date.clone())
                        .or_default()
                        .entry(model.clone())
                        .or_insert(0) += total;
                }
            }

            // Model usage totals
            if !model.is_empty() {
                let m = model_map.entry(model).or_insert((0, 0, 0, 0));
                m.0 += inp;
                m.1 += out;
                m.2 += cr;
                m.3 += cc;
            }

            // Hour counts
            *hour_map.entry(hour).or_insert(0) += 1;

            total_tool_calls += tool_count;
            total_output_tokens += out;
        }
    }

    // Convert aggregation maps to output structs
    let mut daily_activity: Vec<DailyActivity> = daily_map
        .into_iter()
        .map(|(date, bucket)| DailyActivity {
            date,
            message_count: Some(bucket.messages),
            session_count: Some(bucket.files.len() as u64),
            tool_call_count: Some(bucket.tool_calls),
        })
        .collect();
    daily_activity.sort_by(|a, b| a.date.cmp(&b.date));

    let mut daily_model_tokens: Vec<DailyModelTokens> = daily_tokens
        .into_iter()
        .map(|(date, tokens_by_model)| DailyModelTokens {
            date,
            tokens_by_model: Some(tokens_by_model),
        })
        .collect();
    daily_model_tokens.sort_by(|a, b| a.date.cmp(&b.date));

    let model_usage: HashMap<String, ModelUsageEntry> = model_map
        .into_iter()
        .map(|(model, (inp, out, cr, cc))| {
            (
                model,
                ModelUsageEntry {
                    input_tokens: Some(inp),
                    output_tokens: Some(out),
                    cache_read_input_tokens: Some(cr),
                    cache_creation_input_tokens: Some(cc),
                },
            )
        })
        .collect();

    let hour_counts: HashMap<String, u64> = hour_map
        .into_iter()
        .map(|(h, c)| (h.to_string(), c))
        .collect();

    Ok(LiveStats {
        daily_activity,
        daily_model_tokens,
        model_usage,
        hour_counts,
        total_tool_calls,
        total_output_tokens,
        scanned_files,
        scan_duration_ms: start_time.elapsed().as_millis() as u64,
    })
}

// ── read_session_transcript ───────────────────────────────────

#[tauri::command]
pub fn read_session_transcript(
    session_id: String,
    project: String,
) -> Result<SessionTranscript, String> {
    if session_id.contains('/')
        || session_id.contains('\\')
        || session_id.contains("..")
    {
        return Err("Invalid session ID".to_string());
    }

    let projects_dir = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("projects");

    // Encode project path: /Users/john/repos/foo → -Users-john-repos-foo
    let encoded = project.replace('/', "-");
    let encoded = if encoded.starts_with('-') {
        encoded
    } else {
        format!("-{}", encoded)
    };

    if encoded.contains("..") {
        return Err("Invalid project path".to_string());
    }

    let session_dir = projects_dir.join(&encoded);
    let main_jsonl = session_dir.join(format!("{}.jsonl", session_id));

    let mut entries: Vec<TranscriptEntry> = Vec::new();
    let mut subagent_count = 0u32;

    // Parse main JSONL
    if main_jsonl.exists() {
        parse_transcript_file(&main_jsonl, false, &mut entries);
    }

    // Parse subagent JSONLs
    let subagent_dir = session_dir.join(&session_id).join("subagents");
    if subagent_dir.exists() {
        if let Ok(dir_entries) = std::fs::read_dir(&subagent_dir) {
            for entry in dir_entries.flatten() {
                if entry.path().extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    subagent_count += 1;
                    parse_transcript_file(&entry.path(), true, &mut entries);
                }
            }
        }
    }

    // Sort by timestamp
    entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    // Compute totals from ALL entries before truncation
    let mut total_input = 0u64;
    let mut total_output = 0u64;
    let mut total_tools = 0u64;
    let mut models_set = HashSet::new();

    for e in &entries {
        total_input += e.input_tokens.unwrap_or(0);
        total_output += e.output_tokens.unwrap_or(0);
        total_tools += e.tool_names.len() as u64;
        if let Some(ref m) = e.model {
            models_set.insert(m.clone());
        }
    }

    // Truncate entries for transport, but totals reflect the full session
    let truncated = entries.len() > 500;
    entries.truncate(500);

    let mut models_used: Vec<String> = models_set.into_iter().collect();
    models_used.sort();

    Ok(SessionTranscript {
        session_id,
        entries,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_tool_calls: total_tools,
        models_used,
        subagent_count,
        truncated,
    })
}
