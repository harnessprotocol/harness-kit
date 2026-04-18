use crate::ai::client::OllamaState;
use crate::ai::types::{
    ChatMessage, ChatRequest, DownloadProgress, ModelDetails, ModelInfo, RunningModel, StreamEvent,
    ToolDef,
};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::ipc::Channel;
use tauri::State;

// ─── Frontend-facing response types (camelCase for JS) ──────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub running: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AISessionRow {
    pub id: String,
    pub title: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub system_prompt: Option<String>,
    pub context_sources_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AIMessageRow {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub metadata_json: Option<String>,
}

// ─── Ollama service commands ─────────────────────────────────────────────────

#[tauri::command]
pub async fn check_ollama_running(
    ollama: State<'_, OllamaState>,
) -> Result<OllamaStatus, String> {
    if ollama.client.check_health().await {
        Ok(OllamaStatus {
            running: true,
            message: "Ollama is running".to_string(),
        })
    } else {
        Ok(OllamaStatus {
            running: false,
            message: "Ollama is not running. Start it with: ollama serve".to_string(),
        })
    }
}

#[tauri::command]
pub async fn list_models(
    ollama: State<'_, OllamaState>,
) -> Result<Vec<ModelInfo>, String> {
    ollama.client.list_models().await
}

#[tauri::command]
pub async fn pull_model(
    model: String,
    channel: Channel<DownloadProgress>,
    ollama: State<'_, OllamaState>,
) -> Result<(), String> {
    ollama
        .client
        .pull_model(&model, |progress| {
            channel
                .send(progress)
                .map_err(|e| format!("Channel error: {}", e))
        })
        .await
}

#[tauri::command]
pub async fn ai_stream_chat(
    model: String,
    messages: Vec<ChatMessage>,
    tools: Option<Vec<ToolDef>>,
    options: Option<serde_json::Value>,
    channel: Channel<StreamEvent>,
    ollama: State<'_, OllamaState>,
) -> Result<(), String> {
    ollama.cancel.store(false, Ordering::Relaxed);

    let request = ChatRequest {
        model,
        messages,
        stream: Some(true),
        tools,
        options,
        keep_alive: None,
    };

    let cancel = ollama.cancel.clone();
    ollama
        .client
        .stream_chat(request, cancel, |event| {
            channel
                .send(event)
                .map_err(|e| format!("Channel error: {}", e))
        })
        .await
}

#[tauri::command]
pub fn cancel_ai_stream(ollama: State<'_, OllamaState>) -> Result<(), String> {
    ollama.cancel.store(true, Ordering::Relaxed);
    Ok(())
}

// ─── Session commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_ai_session(
    db: State<'_, Db>,
    id: String,
    model: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ai_sessions (id, title, model, created_at, updated_at) VALUES (?1, NULL, ?2, ?3, ?4)",
        rusqlite::params![id, model, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_ai_session_title(
    db: State<'_, Db>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE ai_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![title, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_ai_session_prompt(
    db: State<'_, Db>,
    id: String,
    system_prompt: Option<String>,
    context_sources_json: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE ai_sessions SET system_prompt = ?1, context_sources_json = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![system_prompt, context_sources_json, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_ai_session(
    db: State<'_, Db>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM ai_sessions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn list_ai_sessions(db: State<'_, Db>) -> Result<Vec<AISessionRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, model, created_at, updated_at, system_prompt, context_sources_json FROM ai_sessions ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AISessionRow {
                id: row.get(0)?,
                title: row.get(1)?,
                model: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                system_prompt: row.get(5)?,
                context_sources_json: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn load_ai_session(
    db: State<'_, Db>,
    session_id: String,
) -> Result<(AISessionRow, Vec<AIMessageRow>), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let session = conn
        .query_row(
            "SELECT id, title, model, created_at, updated_at, system_prompt, context_sources_json FROM ai_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| {
                Ok(AISessionRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    model: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    system_prompt: row.get(5)?,
                    context_sources_json: row.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Session not found: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, timestamp, metadata_json FROM ai_messages WHERE session_id = ?1 ORDER BY timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let messages = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok(AIMessageRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                metadata_json: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok((session, messages))
}

#[tauri::command]
pub fn save_ai_message(
    db: State<'_, Db>,
    id: String,
    session_id: String,
    role: String,
    content: String,
    metadata_json: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let timestamp = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ai_messages (id, session_id, role, content, timestamp, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, session_id, role, content, timestamp, metadata_json],
    )
    .map_err(|e| e.to_string())?;

    // Bump session updated_at so it surfaces at the top of the list
    conn.execute(
        "UPDATE ai_sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![timestamp, session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Model introspection commands ───────────────────────────────────────────

#[tauri::command]
pub async fn list_running_models(
    ollama: State<'_, OllamaState>,
) -> Result<Vec<RunningModel>, String> {
    ollama.client.get_running_models().await
}

#[tauri::command]
pub async fn show_model(
    name: String,
    ollama: State<'_, OllamaState>,
) -> Result<ModelDetails, String> {
    ollama.client.show_model(&name).await
}

#[tauri::command]
pub async fn get_ollama_version(
    ollama: State<'_, OllamaState>,
) -> Result<String, String> {
    ollama.client.get_version().await
}

// ─── AI config commands ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL: &str = "http://localhost:11434";

fn ai_config_path() -> std::path::PathBuf {
    dirs::home_dir()
        .expect("No home directory")
        .join(".harness-kit")
        .join("ai-config.json")
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AIConfig {
    pub base_url: String,
}

impl Default for AIConfig {
    fn default() -> Self {
        Self { base_url: DEFAULT_BASE_URL.to_string() }
    }
}

pub fn load_ai_config() -> AIConfig {
    let path = ai_config_path();
    if let Ok(contents) = std::fs::read_to_string(&path) {
        serde_json::from_str(&contents).unwrap_or_default()
    } else {
        AIConfig::default()
    }
}

#[tauri::command]
pub fn get_ai_config() -> Result<AIConfig, String> {
    Ok(load_ai_config())
}

#[tauri::command]
pub fn set_ai_config(
    base_url: String,
    ollama: State<'_, OllamaState>,
) -> Result<(), String> {
    // Validate: only http/https to localhost allowed (prevent SSRF)
    let parsed = url::Url::parse(&base_url).map_err(|_| "Invalid URL".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        s => return Err(format!("Unsupported scheme '{}' — only http/https allowed", s)),
    }
    let host = parsed.host_str().ok_or("Missing host in URL")?;
    if host != "localhost" && host != "127.0.0.1" && host != "::1" {
        return Err("Only localhost URLs are allowed".to_string());
    }
    if base_url.len() > 256 {
        return Err("base_url too long (max 256 chars)".to_string());
    }

    let config = AIConfig { base_url: base_url.clone() };
    let path = ai_config_path();

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let contents = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;

    // Update the live client base URL without restarting Tauri managed state
    *ollama.client.base_url.lock().map_err(|e| e.to_string())? = base_url;
    Ok(())
}
